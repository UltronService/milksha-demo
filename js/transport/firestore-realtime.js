/**
 * Firestore onSnapshot: today_board + control/pending only (shared Firebase app).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};
  const Paths = QMS.Transport.Paths;
  const TodayBoard = QMS.Board.TodayBoard;
  const Bridge = QMS.Transport.FirebaseSdkBridge;
  const LISTENER_ATTACH_TIMEOUT_MS = 8000;

  function sleepMs(ms) {
    return new Promise(function (resolve) {
      root.setTimeout(resolve, ms);
    });
  }

  function withTimeout(promise, label) {
    return Promise.race([
      promise,
      sleepMs(LISTENER_ATTACH_TIMEOUT_MS).then(function () {
        throw new Error(label || 'listener_attach_timeout');
      }),
    ]);
  }

  /**
   * @param {object|null} raw
   * @returns {object|null}
   */
  function normalizePendingCommand(raw) {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const id = raw.id != null ? String(raw.id) : '';
    if (!id) {
      return null;
    }
    const type = raw.type != null ? String(raw.type) : '';
    if (!type) {
      return null;
    }
    const out = {
      id: id,
      type: type,
      params: raw.params && typeof raw.params === 'object' ? raw.params : {},
    };
    if (raw.boardSeq != null) {
      out.boardSeq = raw.boardSeq;
    }
    if (raw.issuedAtMs != null) {
      out.issuedAtMs = raw.issuedAtMs;
    }
    if (raw.issuedAt != null) {
      out.issuedAt = raw.issuedAt;
    }
    if (raw.createdAt != null) {
      out.createdAt = raw.createdAt;
    }
    return out;
  }

  /**
   * @param {object|null} prev
   * @param {object|null} next
   * @returns {boolean}
   */
  function pendingCommandChanged(prev, next) {
    const prevId = prev && prev.id ? String(prev.id) : '';
    const nextId = next && next.id ? String(next.id) : '';
    if (!nextId) {
      return false;
    }
    if (prevId !== nextId) {
      return true;
    }
    if (!prev && next) {
      return true;
    }
    return false;
  }

  /**
   * @param {object} options
   */
  function createFirestoreRealtimeListener(options) {
    const config = options.config;
    const storeId = options.storeId;
    const deviceId = options.deviceId;
    const session = options.session;
    const onBoardSnapshot = options.onBoardSnapshot || function () {};
    const onCommandSnapshot = options.onCommandSnapshot || function () {};
    const onBoardFallback = options.onBoardFallback || function () {};
    const onCommandPollFallback = options.onCommandPollFallback || function () {};
    const onListenerError = options.onListenerError || function () {};

    let boardUnsub = null;
    let commandUnsub = null;
    let commandMode = 'poll';
    let boardListenActive = false;
    let lastSeenPendingId = '';
    let readCounts = { board: 0, command: 0 };

    function bump(kind) {
      if (kind === 'board') {
        readCounts.board += 1;
      } else if (kind === 'command') {
        readCounts.command += 1;
      }
    }

    function stopCommandListener() {
      if (commandUnsub) {
        commandUnsub();
        commandUnsub = null;
      }
      commandMode = 'poll';
    }

    function stop() {
      if (boardUnsub) {
        boardUnsub();
        boardUnsub = null;
      }
      stopCommandListener();
      boardListenActive = false;
    }

    function boardDocRef(db) {
      return db.doc(Paths.todayBoardPath(storeId));
    }

    function controlPendingRef(db) {
      return db.doc(Paths.devicePendingControlPath(storeId, deviceId));
    }

    function emitBoardFromSnapshot(snap) {
      bump('board');
      if (!snap.exists) {
        onBoardSnapshot({
          missing: true,
          httpDate: '',
          httpDateReadable: false,
        });
        return;
      }
      const raw = snap.data();
      const norm = TodayBoard.normalizeTodayBoard(raw);
      if (!norm.ok) {
        return;
      }
      onBoardSnapshot({
        data: norm.board,
        updateTime: snap.updateTime && snap.updateTime.toMillis
          ? new Date(snap.updateTime.toMillis()).toISOString()
          : norm.board.updatedAt || '',
        httpDate: '',
        httpDateReadable: false,
      });
    }

    function tryEmitCommand(cmd) {
      if (!cmd || !cmd.id) {
        return;
      }
      const id = String(cmd.id);
      if (id === lastSeenPendingId && !pendingCommandChanged({ id: lastSeenPendingId }, cmd)) {
        return;
      }
      lastSeenPendingId = id;
      onCommandSnapshot(cmd, null);
    }

    function attachBoardListener(db) {
      return new Promise(function (resolve, reject) {
        let settled = false;
        boardUnsub = boardDocRef(db).onSnapshot(
          function (snap) {
            emitBoardFromSnapshot(snap);
            if (!settled) {
              settled = true;
              boardListenActive = true;
              resolve(true);
            }
          },
          function (err) {
            onListenerError(err);
            if (!settled) {
              settled = true;
              reject(err);
            }
          },
        );
      });
    }

    function attachControlPendingListener(db) {
      return new Promise(function (resolve, reject) {
        let settled = false;
        commandUnsub = controlPendingRef(db).onSnapshot(
          function (snap) {
            bump('command');
            if (!settled) {
              settled = true;
              commandMode = 'control';
              resolve('control');
            }
            if (!snap.exists) {
              lastSeenPendingId = '';
              return;
            }
            tryEmitCommand(normalizePendingCommand(snap.data()));
          },
          function (err) {
            onListenerError(err);
            if (!settled) {
              settled = true;
              reject(err);
            }
          },
        );
      });
    }

    async function start() {
      if (!Bridge || !Bridge.isSdkLoaded()) {
        onBoardFallback('sdk_missing');
        onCommandPollFallback('sdk_missing');
        return { boardListen: false, commandMode: 'poll' };
      }
      const signed = await Bridge.ensureFirebaseSignedIn(config, session);
      if (!signed) {
        onBoardFallback('auth_failed');
        onCommandPollFallback('auth_failed');
        return { boardListen: false, commandMode: 'poll' };
      }
      const db = Bridge.firestoreDb();
      if (!db) {
        onBoardFallback('firestore_unavailable');
        onCommandPollFallback('firestore_unavailable');
        return { boardListen: false, commandMode: 'poll' };
      }

      try {
        await withTimeout(attachBoardListener(db), 'board_listen_timeout');
      } catch (e) {
        stop();
        onBoardFallback('board_listen_failed');
        onCommandPollFallback('board_listen_failed');
        return { boardListen: false, commandMode: 'poll' };
      }

      try {
        await withTimeout(attachControlPendingListener(db), 'control_listen_timeout');
        return { boardListen: boardListenActive, commandMode: commandMode };
      } catch (e) {
        stopCommandListener();
        onCommandPollFallback('command_listen_failed');
        return { boardListen: boardListenActive, commandMode: 'poll' };
      }
    }

    async function forceRefetch() {
      const db = Bridge.firestoreDb();
      if (!db) {
        return;
      }
      try {
        const boardSnap = await boardDocRef(db).get();
        emitBoardFromSnapshot(boardSnap);
      } catch (e) {
        onListenerError(e);
      }
      if (commandMode !== 'control') {
        return;
      }
      try {
        const snap = await controlPendingRef(db).get();
        bump('command');
        if (!snap.exists) {
          lastSeenPendingId = '';
          return;
        }
        tryEmitCommand(normalizePendingCommand(snap.data()));
      } catch (e) {
        onListenerError(e);
      }
    }

    return {
      start: start,
      stop: stop,
      stopCommandListener: stopCommandListener,
      forceRefetch: forceRefetch,
      getStats: function () {
        return {
          boardListen: boardListenActive,
          commandMode: commandMode,
          readCounts: {
            board: readCounts.board,
            command: readCounts.command,
          },
        };
      },
    };
  }

  QMS.Transport.FirestoreRealtime = {
    normalizePendingCommand: normalizePendingCommand,
    pendingCommandChanged: pendingCommandChanged,
    createFirestoreRealtimeListener: createFirestoreRealtimeListener,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
