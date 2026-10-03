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
    const enableTestReloadSpy = Boolean(options.enableTestReloadSpy);
    const pauseAutoDevicePoll = Boolean(options.enableTestPollHook);

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
    let lastSessionBusinessDate = '';
    let suppressRingOnNextApply = false;
    let lastResolvedBusinessDate = '';
    let lastResolvedSource = '';
    let clockSkewSilentRefetchPending = false;

    const cacheKey = 'milksha:receiver-cache:' + storeId;
    const cloudApi = transport.cloudApi;

    const chimePolicy =
      QMS.Receiver.createBoardChimePolicy &&
      QMS.Receiver.createBoardChimePolicy({
        getBusinessDate: function () {
          return TodayBoard.getSessionBusinessDate();
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

    function saveCache(seq, numberContent, boardUpdatedAt) {
      const bd = TodayBoard.getSessionBusinessDate();
      const updatedAt = String(boardUpdatedAt || '').trim();
      if (!bd || !updatedAt) {
        return;
      }
      try {
        root.localStorage.setItem(
          cacheKey,
          JSON.stringify({
            seq: seq,
            numberContent: numberContent,
            businessDate: bd,
            boardUpdatedAt: updatedAt,
          }),
        );
      } catch (e) {
        /* ignore */
      }
    }

    function guestClockReferenceMs(boardDoc) {
      if (boardDoc && boardDoc.httpDateReadable && boardDoc.httpDate) {
        const t = Date.parse(boardDoc.httpDate);
        if (!Number.isNaN(t)) {
          return t;
        }
      }
      return null;
    }

    function bootGuestClockOk() {
      const cached = loadCache();
      return Boolean(cached) && TodayBoard.shouldShowBootCache(cached, new Date());
    }

    function syncGuestClockAfterBoot() {
      if (!demoApi || typeof demoApi.setGuestClockState !== 'function') {
        return;
      }
      const cached = loadCache();
      const ok = Boolean(cached) && TodayBoard.shouldShowBootCache(cached, new Date());
      demoApi.setGuestClockState({ hidden: !ok, clearCloudAnchor: true });
    }

    function revealGuestClockFromCloudBoard(boardDoc) {
      if (!demoApi || typeof demoApi.setGuestClockState !== 'function') {
        return;
      }
      const refMs = guestClockReferenceMs(boardDoc);
      if (refMs != null) {
        demoApi.setGuestClockState({ hidden: false, timeMs: refMs });
        return;
      }
      if (bootGuestClockOk()) {
        demoApi.setGuestClockState({ hidden: false, clearCloudAnchor: true });
        return;
      }
      demoApi.setGuestClockState({ hidden: true });
    }

    function tryApplyBootCache() {
      const cached = loadCache();
      if (!TodayBoard.shouldShowBootCache(cached)) {
        return false;
      }
      const list = Array.isArray(cached.numberContent) ? cached.numberContent : [];
      if (list.length === 0) {
        return false;
      }
      const bd = String(cached.businessDate || '');
      TodayBoard.setSessionBusinessDate(bd);
      lastSessionBusinessDate = bd;
      applyNumberContent(list, localSeq, {
        silent: true,
        preserveFirstBatchFlag: true,
        skipCacheWrite: true,
        bootCacheRestore: true,
      });
      return true;
    }

    function noteSessionBusinessDateRoll(nextBusinessDate) {
      const nextBd = String(nextBusinessDate || '');
      if (!nextBd) {
        return;
      }
      if (lastSessionBusinessDate && lastSessionBusinessDate !== nextBd) {
        if (chimePolicy) {
          chimePolicy.onBusinessDateRoll();
        }
        clearGuestBoard({ silent: true });
      }
      lastSessionBusinessDate = nextBd;
      TodayBoard.setSessionBusinessDate(nextBd);
    }

    function dropStaleCacheIfBusinessDayMismatch(resolvedBusinessDate) {
      const cached = loadCache();
      if (!cached || !cached.businessDate) {
        return;
      }
      if (!TodayBoard.isSameBusinessDate(cached.businessDate, resolvedBusinessDate)) {
        try {
          root.localStorage.removeItem(cacheKey);
        } catch (e) {
          /* ignore */
        }
      }
    }

    function noteResolvedBusinessDate(resolved) {
      if (!resolved || !resolved.ok) {
        return;
      }
      const nextBd = resolved.businessDate;
      const nextSource = resolved.source;
      if (
        lastResolvedBusinessDate &&
        lastResolvedBusinessDate !== nextBd &&
        clockSkewSilentRefetchPending
      ) {
        suppressRingOnNextApply = true;
        clockSkewSilentRefetchPending = false;
      }
      if (nextSource === 'board' || nextSource === 'http_date') {
        if (TodayBoard.isClockSkewedFromTrusted(nextBd)) {
          clockSkewSilentRefetchPending = true;
        }
      }
      lastResolvedBusinessDate = nextBd;
      lastResolvedSource = nextSource;
    }

    function clearGuestBoard(opts) {
      const o = opts || {};
      applyNumberContent([], localSeq, {
        silent: o.silent !== false,
        preserveFirstBatchFlag: true,
        skipCacheWrite: true,
      });
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
        preserveFirstBatchFlag: Boolean(opts && opts.preserveFirstBatchFlag),
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
      if (!(opts && opts.skipCacheWrite) && TodayBoard.hasSessionBusinessDate()) {
        saveCache(localSeq, list, opts && opts.boardUpdatedAt);
      }
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
      const resolved = TodayBoard.resolveSessionBusinessDate({
        boardBusinessDate: board.businessDate,
        httpDateHeader: boardDoc.httpDate || '',
        httpDateReadable: Boolean(boardDoc.httpDateReadable),
      });
      if (!resolved.ok) {
        return { ignored: true, reason: 'no_business_date' };
      }
      noteResolvedBusinessDate(resolved);
      dropStaleCacheIfBusinessDayMismatch(resolved.businessDate);
      noteSessionBusinessDateRoll(resolved.businessDate);
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
      const applyOpts = Object.assign({}, opts || {}, { boardUpdatedAt: board.updatedAt });
      const run = function () {
        return applyNumberContent(numberContent, seq, applyOpts);
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

    function authBlocksCloudWork() {
      return (
        transport.session &&
        transport.session.isAuthStopped &&
        transport.session.isAuthStopped()
      );
    }

    async function pollBoard() {
      if (authBlocksCloudWork()) {
        return;
      }
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
        if (board.missing) {
          revealGuestClockFromCloudBoard(board);
          onStatusLine('board: 無名單');
          return;
        }
        const marker = board.updateTime || board.data.updatedAt || String(board.data.seq || '');
        if (marker && marker === lastBoardUpdateTime) {
          return;
        }
        lastBoardUpdateTime = marker;
        revealGuestClockFromCloudBoard(board);
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
        if (enableTestReloadSpy) {
          root.__testReloadFired = true;
          try {
            root.sessionStorage.setItem('__rcv_test_reload', '1');
          } catch (e) {
            /* ignore */
          }
          const stage = root.document && root.document.getElementById('rcv-stage');
          if (stage) {
            stage.setAttribute('data-test-remote-reload', '1');
          }
        }
        root.location.reload();
      } else if (type === 'reboot') {
        if (root.AndroidBridge && typeof root.AndroidBridge.reboot === 'function') {
          root.AndroidBridge.reboot();
        } else {
          root.location.reload();
        }
      }
    }

    function isFirestoreAbortError(err) {
      if (!err) {
        return false;
      }
      if (err.name === 'AbortError') {
        return true;
      }
      const msg = err.message ? String(err.message) : '';
      return msg.indexOf('aborted') !== -1;
    }

    async function pollDevice() {
      if (authBlocksCloudWork()) {
        return;
      }
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
        if (isFirestoreAbortError(e)) {
          return;
        }
        onStatusLine('device 錯誤: ' + (e && e.message ? e.message : 'unknown'));
      }
    }

    async function sendHeartbeat() {
      if (authBlocksCloudWork()) {
        return;
      }
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

    let runtimeAuthKickDone = false;

    async function ensureAuth() {
      if (runtimeAuthKickDone) {
        return;
      }
      runtimeAuthKickDone = true;
      if (transport.session && transport.session.ensureIdToken) {
        try {
          await transport.session.ensureIdToken();
        } catch (e) {
          /* guest board: auth handled in cloud-boot */
        }
      }
    }

    function start() {
      setSimulatedOfflineFlag(false);
      TodayBoard.clearSessionBusinessDate();
      lastSessionBusinessDate = '';
      lastResolvedBusinessDate = '';
      lastResolvedSource = '';
      clockSkewSilentRefetchPending = false;

      tryApplyBootCache();
      syncGuestClockAfterBoot();

      const kick = function () {
        sendHeartbeat();
        pollBoard();
        pollDevice();
      };
      ensureAuth().then(kick).catch(kick);

      tickTimer = setInterval(function () {
        tickMs += 1000;
        if (!pauseAutoDevicePoll && tickMs % devicePollMs === 0) {
          pollDevice();
        }
        if (tickMs % boardPollMs === 0) {
          pollBoard();
        }
        if (tickMs % heartbeatMs === 0) {
          sendHeartbeat();
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

    const api = {
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
    if (options.enableTestPollHook) {
      api.pollDeviceForTests = async function () {
        const blocked = authBlocksCloudWork();
        let pendingId = '';
        if (!blocked) {
          try {
            const dev = await transport.readDevice(deviceId);
            const pending = dev && dev.data ? dev.data.pendingCommand : null;
            pendingId = pending && pending.id ? String(pending.id) : '';
          } catch (e) {
            pendingId = '';
          }
        }
        await pollDevice();
        return {
          authBlocked: blocked,
          pendingId: pendingId,
          lastHandledCommandId: lastHandledCommandId,
          reloadFired: Boolean(root.__testReloadFired),
        };
      };
    }
    return api;
  }

  QMS.Receiver.bootReceiverCloud = bootReceiverCloud;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
