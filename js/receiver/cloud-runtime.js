/**
 * Receiver cloud sync — single tick timer, device poll while simulated offline.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  const Validate = QMS.Receiver.Validate;
  const BoardSeq = QMS.Transport.BoardSeq;
  const TodayBoard = QMS.Board.TodayBoard;

  const VERSION = 'receiver-demo-2026-10-02';

  function isDemoMode() {
    try {
      return new URLSearchParams(root.location.search).get('demo') === '1';
    } catch (e) {
      return false;
    }
  }

  /** Offline is visible only in demo panel (?demo=1) and controller — never on the guest board. */
  function setSimulatedOfflineFlag(on, demoApi) {
    if (demoApi && typeof demoApi.setOffline === 'function') {
      demoApi.setOffline(on);
    }
    const doc = root.document;
    if (!doc) {
      return;
    }
    const stage = doc.getElementById('rcv-stage');
    if (stage) {
      stage.setAttribute('data-simulated-offline', '0');
    }
    if (!isDemoMode()) {
      return;
    }
    const panel = doc.getElementById('rcv-demo-panel');
    if (panel) {
      panel.setAttribute('data-simulated-offline', on ? '1' : '0');
    }
    const statusEl = doc.getElementById('rcv-cloud-status');
    if (statusEl) {
      if (on) {
        statusEl.textContent = '模擬斷線中（僅展示面板）';
      } else if (String(statusEl.textContent).indexOf('模擬斷線') >= 0) {
        statusEl.textContent = '';
      }
    }
  }

  function bootReceiverCloud(options) {
    const storeId = options.storeId;
    const deviceId = options.deviceId || 'stb-01';
    const transport = options.transport;
    const demoApi = options.receiverDemo;
    const boardPollMs = options.boardPollIntervalMs || 2000;
    const devicePollMs = options.devicePollIntervalMs || 5000;
    const heartbeatMs = options.heartbeatIntervalMs || 15000;
    const onStatusLine = options.onStatusLine || function () {};
    const onBoardAck = options.onBoardAck || function () {};

    let localSeq = 0;
    let lastBoardUpdateTime = '';
    let tickTimer = null;
    let tickMs = 0;
    let simulateOffline = false;
    let networkDelayMs = 0;
    let lastAckCommandId = '';
    let lastHandledCommandId = '';
    let pendingAckCommandId = '';
    let prevReadySet = new Set();
    let slowNetworkTimer = null;
    let last0300ClearDate = '';
    let suppressRingOnNextApply = false;

    const cacheKey = 'milksha:receiver-cache:' + storeId;
    const cloudApi = transport.cloudApi;

    const chimePolicy =
      QMS.Receiver.createBoardChimePolicy &&
      QMS.Receiver.createBoardChimePolicy({
        getBusinessDate: function () {
          return TodayBoard.taipeiBusinessDate();
        },
        newlyReadyIds: BoardSeq.newlyReadyIds,
      });

    function loadCache() {
      try {
        const raw = root.localStorage.getItem(cacheKey);
        if (!raw) {
          return null;
        }
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    }

    function saveCache(seq, numberContent) {
      try {
        root.localStorage.setItem(
          cacheKey,
          JSON.stringify({
            seq: seq,
            numberContent: numberContent,
            businessDate: TodayBoard.taipeiBusinessDate(),
            savedAt: Date.now(),
          }),
        );
      } catch (e) {
        /* ignore */
      }
    }

    function clearGuestBoard(silent) {
      applyNumberContent([], localSeq, { silent: silent });
      saveCache(localSeq, []);
    }

    function applyNumberContent(numberContent, seq, opts) {
      const list = Array.isArray(numberContent) ? numberContent : [];
      const nextReady = BoardSeq.readyIdSetFromContent(
        list,
        Validate.parseSourceType,
        Validate.itemId,
      );
      const ringOpts = {
        silent: Boolean(opts && opts.silent),
        suppressRing: suppressRingOnNextApply,
      };
      if (suppressRingOnNextApply) {
        suppressRingOnNextApply = false;
      }
      const ringIds =
        chimePolicy
          ? chimePolicy.pickRingIds(prevReadySet, nextReady, ringOpts)
          : [];

      const store = Validate.findStore(storeId);
      const req = {
        isEncrypt: false,
        serviceSpecialData_Json: {
          target: store.target,
          data: { number_content: list, newsTicker_content: [], newsTickerSpeed: 0 },
        },
        merchant_id: store.merchant_id,
        account: store.account,
        timeStmp: '2026-10-02-12-00-00:0000',
        serviceSpecialData_Json_Md5Hash: 'cloud',
        signature: 'CLOUD',
      };

      const res = demoApi.pushFromObject(req, {
        skipOfflineCheck: true,
        newlyReadyIds: ringIds,
      });
      prevReadySet = nextReady;
      if (typeof seq === 'number') {
        localSeq = seq;
      }
      saveCache(localSeq, list);
      onBoardAck({ seq: localSeq, response: res, newlyReady: ringIds });
      return res;
    }

    function tryApplyTodayBoard(boardDoc, opts) {
      if (!boardDoc || !boardDoc.data) {
        return null;
      }
      const norm = TodayBoard.normalizeTodayBoard(boardDoc.data);
      if (!norm.ok) {
        return { ignored: true, reason: Validate.MSG.format };
      }
      const board = norm.board;
      const seq = board.seq;
      if (!TodayBoard.isCurrentBusinessDate(board.businessDate)) {
        clearGuestBoard(true);
        return { ignored: true, reason: 'business_date' };
      }
      if (!BoardSeq.shouldAcceptBoard(seq, localSeq)) {
        return { ignored: true, reason: Validate.MSG.stale };
      }
      if (simulateOffline) {
        const numberContentOffline = TodayBoard.ticketsToNumberContent(board.tickets);
        prevReadySet = BoardSeq.readyIdSetFromContent(
          numberContentOffline,
          Validate.parseSourceType,
          Validate.itemId,
        );
        return { ignored: true, reason: Validate.MSG.offline };
      }
      const numberContent = TodayBoard.ticketsToNumberContent(board.tickets);
      const run = function () {
        return applyNumberContent(numberContent, seq, opts);
      };
      if (networkDelayMs > 0) {
        return new Promise(function (resolve) {
          if (slowNetworkTimer) {
            clearTimeout(slowNetworkTimer);
          }
          slowNetworkTimer = setTimeout(function () {
            resolve(run());
          }, networkDelayMs);
        });
      }
      return run();
    }

    async function pollBoard() {
      if (simulateOffline) {
        try {
          const board = await transport.readBoard();
          if (board && board.data) {
            const norm = TodayBoard.normalizeTodayBoard(board.data);
            if (norm.ok) {
              const nc = TodayBoard.ticketsToNumberContent(norm.board.tickets);
              prevReadySet = BoardSeq.readyIdSetFromContent(
                nc,
                Validate.parseSourceType,
                Validate.itemId,
              );
            }
          }
        } catch (e) {
          /* ignore */
        }
        return;
      }
      try {
        const board = await transport.readBoard();
        if (!board) {
          onStatusLine('board: 無名單');
          return;
        }
        const marker = board.updateTime || board.data.updatedAt || String(board.data.seq || '');
        if (marker && marker === lastBoardUpdateTime) {
          return;
        }
        lastBoardUpdateTime = marker;
        await tryApplyTodayBoard(board);
      } catch (e) {
        onStatusLine('board 錯誤: ' + (e && e.message ? e.message : 'unknown'));
      }
    }

    async function handleCommand(cmd) {
      const type = cmd.type;
      const params = cmd.params || {};
      lastHandledCommandId = cmd.id;
      pendingAckCommandId = cmd.id;
      if (type === 'simulate_offline') {
        simulateOffline = true;
        setSimulatedOfflineFlag(true, demoApi);
      } else if (type === 'restore') {
        simulateOffline = false;
        networkDelayMs = 0;
        setSimulatedOfflineFlag(false, demoApi);
        suppressRingOnNextApply = true;
        try {
          const boardSnap = await transport.readBoard();
          if (boardSnap && boardSnap.data && boardSnap.data.tickets) {
            const nc = TodayBoard.ticketsToNumberContent(boardSnap.data.tickets);
            prevReadySet = BoardSeq.readyIdSetFromContent(
              nc,
              Validate.parseSourceType,
              Validate.itemId,
            );
          }
        } catch (e) {
          /* ignore */
        }
        pollBoard();
      } else if (type === 'slow') {
        networkDelayMs = Number(params.delayMs) || 3000;
      } else if (type === 'clear_now') {
        applyNumberContent([], localSeq, { silent: true });
      } else if (type === 'reload') {
        root.location.reload();
      } else if (type === 'reboot') {
        if (root.AndroidBridge && typeof root.AndroidBridge.reboot === 'function') {
          root.AndroidBridge.reboot();
        } else {
          root.location.reload();
        }
      }
    }

    async function pollDevice() {
      try {
        const dev = await transport.readDevice(deviceId);
        if (!dev || !dev.data) {
          return;
        }
        const pending = dev.data.pendingCommand;
        if (pending && pending.id && pending.id !== lastHandledCommandId) {
          await handleCommand(pending);
        }
      } catch (e) {
        onStatusLine('device 錯誤: ' + (e && e.message ? e.message : 'unknown'));
      }
    }

    async function sendHeartbeat() {
      if (!cloudApi || !cloudApi.boxHeartbeat) {
        return;
      }
      try {
        const ack = pendingAckCommandId || lastAckCommandId || undefined;
        await cloudApi.boxHeartbeat({
          storeId: storeId,
          deviceId: deviceId,
          appVersion: VERSION,
          boardSeq: localSeq,
          pendingUploads: 0,
          simulatedOffline: simulateOffline,
          ackCommandId: ack,
        });
        if (pendingAckCommandId) {
          lastAckCommandId = pendingAckCommandId;
          pendingAckCommandId = '';
        }
      } catch (e) {
        onStatusLine('heartbeat 失敗');
      }
    }

    function check0300Clear() {
      const bd = TodayBoard.taipeiBusinessDate();
      if (last0300ClearDate && last0300ClearDate !== bd) {
        if (chimePolicy) {
          chimePolicy.onBusinessDateRoll();
        }
        clearGuestBoard(true);
      }
      last0300ClearDate = bd;
    }

    async function ensureAuth() {
      if (transport.session && transport.session.ensureIdToken) {
        await transport.session.ensureIdToken();
      }
    }

    function start() {
      setSimulatedOfflineFlag(false);
      const cached = loadCache();
      const todayBd = TodayBoard.taipeiBusinessDate();
      last0300ClearDate = todayBd;
      if (
        cached &&
        Array.isArray(cached.numberContent) &&
        TodayBoard.isCurrentBusinessDate(cached.businessDate)
      ) {
        localSeq = Number(cached.seq) || 0;
        prevReadySet = BoardSeq.readyIdSetFromContent(
          cached.numberContent,
          Validate.parseSourceType,
          Validate.itemId,
        );
        applyNumberContent(cached.numberContent, localSeq, { silent: true });
        prevReadySet = BoardSeq.readyIdSetFromContent(
          cached.numberContent,
          Validate.parseSourceType,
          Validate.itemId,
        );
      } else if (cached && !TodayBoard.isCurrentBusinessDate(cached.businessDate)) {
        clearGuestBoard(true);
      }

      ensureAuth().then(function () {
        sendHeartbeat();
        pollBoard();
        pollDevice();
      });

      tickTimer = setInterval(function () {
        tickMs += 1000;
        if (tickMs % devicePollMs === 0) {
          pollDevice();
        }
        if (tickMs % boardPollMs === 0) {
          pollBoard();
        }
        if (tickMs % heartbeatMs === 0) {
          sendHeartbeat();
        }
        if (tickMs % 60000 === 0) {
          check0300Clear();
        }
      }, 1000);
    }

    function destroy() {
      if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
      }
      if (slowNetworkTimer) {
        clearTimeout(slowNetworkTimer);
      }
      if (transport.destroy) {
        transport.destroy();
      }
    }

    function receiveBoard(payload) {
      if (payload && payload.tickets) {
        return tryApplyTodayBoard({ data: payload });
      }
      if (payload && payload.request) {
        const v = Validate.validateRequestBody(payload.request);
        if (v.error) {
          return { ignored: true, reason: v.error };
        }
        const seq = typeof payload.seq === 'number' ? payload.seq : localSeq + 1;
        return applyNumberContent(v.numberContent, seq, { silent: payload.silent });
      }
      return null;
    }

    return {
      start: start,
      destroy: destroy,
      receiveBoard: receiveBoard,
      getLocalSeq: function () {
        return localSeq;
      },
      isSimulatedOffline: function () {
        return simulateOffline;
      },
    };
  }

  QMS.Receiver.bootReceiverCloud = bootReceiverCloud;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
