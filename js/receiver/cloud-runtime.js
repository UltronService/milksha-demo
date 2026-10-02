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

  function bootReceiverCloud(options) {
    const storeId = options.storeId;
    const deviceId = options.deviceId || 'stb-01';
    const transport = options.transport;
    const demoApi = options.receiverDemo;
    const boardPollMs = options.boardPollIntervalMs || 2000;
    const devicePollMs = options.devicePollIntervalMs || 5000;
    const heartbeatMs = options.heartbeatIntervalMs || 15000;
    const readyHideMinutes = options.readyHideMinutes || 0;
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
    let readyAtById = {};
    let prevReadySet = new Set();
    let isFirstApply = true;
    let slowNetworkTimer = null;
    let last0300ClearDate = '';

    const cacheKey = 'milksha:receiver-cache:' + storeId;
    const cloudApi = transport.cloudApi;

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
          JSON.stringify({ seq: seq, numberContent: numberContent, savedAt: Date.now() }),
        );
      } catch (e) {
        /* ignore */
      }
    }

    function filterHiddenReady(numberContent) {
      if (!readyHideMinutes || readyHideMinutes <= 0) {
        return numberContent;
      }
      const cutoff = Date.now() - readyHideMinutes * 60 * 1000;
      return numberContent.filter(function (row) {
        const parsed = Validate.parseSourceType(row.source_type);
        if (!parsed || parsed.zone !== 'ready') {
          return true;
        }
        const id = Validate.itemId(parsed.sourceKey, row.number);
        const readyAt = readyAtById[id];
        if (!readyAt) {
          return true;
        }
        return readyAt >= cutoff;
      });
    }

    function touchReadyTimes(numberContent) {
      const now = Date.now();
      const nextReady = BoardSeq.readyIdSetFromContent(
        numberContent,
        Validate.parseSourceType,
        Validate.itemId,
      );
      nextReady.forEach(function (id) {
        if (!readyAtById[id]) {
          readyAtById[id] = now;
        }
      });
      Object.keys(readyAtById).forEach(function (k) {
        if (!nextReady.has(k)) {
          delete readyAtById[k];
        }
      });
    }

    function applyNumberContent(numberContent, seq, opts) {
      const filtered = filterHiddenReady(numberContent);
      touchReadyTimes(filtered);
      const nextReady = BoardSeq.readyIdSetFromContent(
        filtered,
        Validate.parseSourceType,
        Validate.itemId,
      );
      const newly = BoardSeq.newlyReadyIds(prevReadySet, nextReady);
      const shouldRing = !isFirstApply && newly.length > 0 && !(opts && opts.silent);

      const store = Validate.findStore(storeId);
      const req = {
        isEncrypt: false,
        serviceSpecialData_Json: {
          target: store.target,
          data: { number_content: filtered, newsTicker_content: [], newsTickerSpeed: 0 },
        },
        merchant_id: store.merchant_id,
        account: store.account,
        timeStmp: '2026-10-02-12-00-00:0000',
        serviceSpecialData_Json_Md5Hash: 'cloud',
        signature: 'CLOUD',
      };

      const res = demoApi.pushFromObject(req, {
        skipOfflineCheck: true,
        newlyReadyIds: shouldRing ? newly : [],
      });
      prevReadySet = nextReady;
      isFirstApply = false;
      if (typeof seq === 'number') {
        localSeq = seq;
      }
      saveCache(localSeq, filtered);
      onBoardAck({ seq: localSeq, response: res, newlyReady: shouldRing ? newly : [] });
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
      if (!BoardSeq.shouldAcceptBoard(seq, localSeq)) {
        return { ignored: true, reason: Validate.MSG.stale };
      }
      if (simulateOffline) {
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
      } else if (type === 'restore') {
        simulateOffline = false;
        networkDelayMs = 0;
        pollBoard();
      } else if (type === 'slow') {
        networkDelayMs = Number(params.delayMs) || 3000;
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
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Taipei',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      }).formatToParts(new Date());
      const h = Number(parts.find(function (p) { return p.type === 'hour'; }).value);
      const m = Number(parts.find(function (p) { return p.type === 'minute'; }).value);
      if (h === 3 && m === 0 && last0300ClearDate !== bd) {
        last0300ClearDate = bd;
        applyNumberContent([], localSeq, { silent: true });
      }
    }

    async function ensureAuth() {
      if (transport.session && transport.session.ensureIdToken) {
        await transport.session.ensureIdToken();
      }
    }

    function start() {
      const cached = loadCache();
      if (cached && Array.isArray(cached.numberContent)) {
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
        isFirstApply = false;
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
    };
  }

  QMS.Receiver.bootReceiverCloud = bootReceiverCloud;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
