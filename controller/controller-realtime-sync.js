/**
 * Controller cloud sync: today_board + devices/{deviceId} onSnapshot (no steady-state REST poll).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Controller = QMS.Controller || {};
  const Paths = QMS.Transport.Paths;
  const TodayBoard = QMS.Board.TodayBoard;
  const Bridge = QMS.Transport.FirebaseSdkBridge;

  const LISTENER_ATTACH_TIMEOUT_MS = 8000;
  const BACKOFF_INITIAL_MS = 1000;
  const BACKOFF_MAX_MS = 30000;

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
   * @param {object} options
   */
  function createControllerRealtimeSync(options) {
    const config = options.config;
    const storeId = options.storeId;
    const deviceId = options.deviceId;
    const session = options.session;
    const onBoardDoc = options.onBoardDoc || function () {};
    const onDeviceDoc = options.onDeviceDoc || function () {};
    const onRealtimeState = options.onRealtimeState || function () {};
    const onListenerError = options.onListenerError || function () {};
    const reconnectInitialMs =
      Number(options.reconnectInitialMs) >= 50
        ? Number(options.reconnectInitialMs)
        : BACKOFF_INITIAL_MS;

    let boardUnsub = null;
    let deviceUnsub = null;
    let boardListenActive = false;
    let deviceListenActive = false;
    let stopped = true;
    let reconnectTimer = null;
    let backoffMs = reconnectInitialMs;
    let isReconnecting = false;
    const readCounts = { board: 0, device: 0, refetch: 0 };

    function bump(kind) {
      if (kind === 'board') {
        readCounts.board += 1;
      } else if (kind === 'device') {
        readCounts.device += 1;
      } else if (kind === 'refetch') {
        readCounts.refetch += 1;
      }
    }

    function stopListeners() {
      if (boardUnsub) {
        boardUnsub();
        boardUnsub = null;
      }
      if (deviceUnsub) {
        deviceUnsub();
        deviceUnsub = null;
      }
      boardListenActive = false;
      deviceListenActive = false;
    }

    function clearReconnectTimer() {
      if (reconnectTimer) {
        root.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function stop() {
      stopped = true;
      clearReconnectTimer();
      stopListeners();
      onRealtimeState({ connected: false, reason: 'stopped' });
    }

    function boardDocRef(db) {
      return db.doc(Paths.todayBoardPath(storeId));
    }

    function deviceDocRef(db) {
      return db.doc(Paths.deviceDocPath(storeId, deviceId));
    }

    function emitBoardFromSnapshot(snap) {
      bump('board');
      if (!snap.exists) {
        onBoardDoc({
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
      onBoardDoc({
        data: norm.board,
        updateTime:
          snap.updateTime && snap.updateTime.toMillis
            ? new Date(snap.updateTime.toMillis()).toISOString()
            : norm.board.updatedAt || '',
        httpDate: '',
        httpDateReadable: false,
      });
    }

    function emitDeviceFromSnapshot(snap) {
      bump('device');
      if (!snap.exists) {
        onDeviceDoc(null);
        return;
      }
      onDeviceDoc({
        data: snap.data(),
        updateTime:
          snap.updateTime && snap.updateTime.toMillis
            ? new Date(snap.updateTime.toMillis()).toISOString()
            : '',
      });
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
            } else {
              scheduleReconnect('board_listener_error');
            }
          },
        );
      });
    }

    function attachDeviceListener(db) {
      return new Promise(function (resolve, reject) {
        let settled = false;
        deviceUnsub = deviceDocRef(db).onSnapshot(
          function (snap) {
            emitDeviceFromSnapshot(snap);
            if (!settled) {
              settled = true;
              deviceListenActive = true;
              resolve(true);
            }
          },
          function (err) {
            onListenerError(err);
            if (!settled) {
              settled = true;
              reject(err);
            } else {
              scheduleReconnect('device_listener_error');
            }
          },
        );
      });
    }

    function scheduleReconnect(reason) {
      if (stopped) {
        return;
      }
      stopListeners();
      onRealtimeState({ connected: false, reason: reason || 'reconnect_scheduled' });
      clearReconnectTimer();
      const delay = backoffMs;
      backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
      reconnectTimer = root.setTimeout(function () {
        reconnectTimer = null;
        isReconnecting = true;
        start().catch(function () {
          /* next backoff via scheduleReconnect */
        });
      }, delay);
    }

    async function forceRefetch() {
      const db = Bridge && Bridge.firestoreDb ? Bridge.firestoreDb() : null;
      if (!db) {
        return;
      }
      bump('refetch');
      try {
        const boardSnap = await boardDocRef(db).get();
        emitBoardFromSnapshot(boardSnap);
      } catch (e) {
        onListenerError(e);
      }
      try {
        const deviceSnap = await deviceDocRef(db).get();
        emitDeviceFromSnapshot(deviceSnap);
      } catch (e) {
        onListenerError(e);
      }
    }

    async function start() {
      stopped = false;
      if (!Bridge || !Bridge.isSdkLoaded()) {
        onRealtimeState({ connected: false, reason: 'sdk_missing' });
        scheduleReconnect('sdk_missing');
        return { boardListen: false, deviceListen: false };
      }
      const signed = await Bridge.ensureFirebaseSignedIn(config, session);
      if (!signed) {
        onRealtimeState({ connected: false, reason: 'auth_failed' });
        scheduleReconnect('auth_failed');
        return { boardListen: false, deviceListen: false };
      }
      const db = Bridge.firestoreDb();
      if (!db) {
        onRealtimeState({ connected: false, reason: 'firestore_unavailable' });
        scheduleReconnect('firestore_unavailable');
        return { boardListen: false, deviceListen: false };
      }

      stopListeners();
      let boardErr = null;
      let deviceErr = null;
      try {
        await withTimeout(attachBoardListener(db), 'board_listen_timeout');
      } catch (e) {
        boardErr = e;
      }
      try {
        await withTimeout(attachDeviceListener(db), 'device_listen_timeout');
      } catch (e) {
        deviceErr = e;
      }

      if (boardErr || deviceErr) {
        stopListeners();
        onRealtimeState({ connected: false, reason: 'listen_attach_failed' });
        scheduleReconnect('listen_attach_failed');
        return { boardListen: false, deviceListen: false };
      }

      if (isReconnecting) {
        isReconnecting = false;
        await forceRefetch();
      }
      backoffMs = reconnectInitialMs;
      onRealtimeState({ connected: true, reason: 'attached' });
      return { boardListen: boardListenActive, deviceListen: deviceListenActive };
    }

    function isActive() {
      return boardListenActive && deviceListenActive && !stopped;
    }

    return {
      start: start,
      stop: stop,
      forceRefetch: forceRefetch,
      isActive: isActive,
      getStats: function () {
        return {
          boardListen: boardListenActive,
          deviceListen: deviceListenActive,
          readCounts: {
            board: readCounts.board,
            device: readCounts.device,
            refetch: readCounts.refetch,
          },
        };
      },
    };
  }

  QMS.Controller.RealtimeSync = {
    createControllerRealtimeSync: createControllerRealtimeSync,
    BACKOFF_INITIAL_MS: BACKOFF_INITIAL_MS,
    BACKOFF_MAX_MS: BACKOFF_MAX_MS,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
