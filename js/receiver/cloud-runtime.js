/**
 * Receiver cloud sync — single tick timer, device poll while simulated offline.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  const Validate = QMS.Receiver.Validate;
  const BoardSeq = QMS.Transport.BoardSeq;
  const TodayBoard = QMS.Board.TodayBoard;

  const VERSION = 'receiver-demo-2026-10-08-realtime-board';
  const FALLBACK_BOARD_POLL_MS = 60000;

  function isDemoMode() {
    try {
      return new URLSearchParams(root.location.search).get('demo') === '1';
    } catch (e) {
      return false;
    }
  }

  function isRealtimeQueryDisabled() {
    try {
      const v = new URLSearchParams(root.location.search).get('realtime');
      return v === '0' || v === 'false';
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
    const milkshaRuntime = options.milkshaRuntime || null;
    const boardPollMs = options.boardPollIntervalMs || 2000;
    const devicePollMs = options.devicePollIntervalMs || 5000;
    const heartbeatMs = options.heartbeatIntervalMs || 15000;
    const onStatusLine = options.onStatusLine || function () {};
    const onBoardAck = options.onBoardAck || function () {};
    const onAuthFailure = options.onAuthFailure || function () {};
    const onSyncAuthUi = options.onSyncAuthUi || function () {};
    const onCloudResync = options.onCloudResync || null;
    const showCloudOfflineUi = Boolean(options.showCloudOfflineUi);
    const skipBootReceiverCache = options.skipBootReceiverCache === true;
    const enableTestReloadSpy = Boolean(options.enableTestReloadSpy);
    const pauseAutoDevicePoll = Boolean(options.enableTestPollHook);
    const skipInitialCloudKick = options.skipInitialCloudKick === true;

    let localSeq = 0;
    let lastBoardUpdateTime = '';
    /** Last applied today_board.updatedAt (epoch ms) from cloud, not browser clock. */
    let lastAppliedCloudBoardUpdatedAtMs = 0;
    let tickTimer = null;
    let tickMs = 0;
    let fastBoardPollTimer = null;
    const bootWallMs = Date.now();
    const FAST_BOARD_POLL_MS = 500;
    const FAST_BOARD_POLL_WINDOW_MS = 20000;
    let heartbeatTimer = null;
    let visibilityHandler = null;
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
    let cloudReachable = true;
    let cloudOfflineUiVisible = false;
    let lastHeartbeatSucceeded = true;
    let lastTickWallMs = Date.now();
    let resyncInFlight = null;
    let reconnectHandlers = [];
    /** @type {object|null} */
    let deferredReloadCommand = null;
    /** @type {object|null} */
    let firestoreRealtime = null;
    let boardListenActive = false;
    /** @type {'control'|'device'|'poll'} */
    let commandListenMode = 'poll';

    const cacheKey = 'milksha:receiver-cache:' + storeId;
    const cloudApi = transport.cloudApi;
    const handledCmdStorageKey = 'milksha:lastHandledCmd:' + storeId + ':' + deviceId;
    const RELOAD_ACK_TIMEOUT_MS = 2500;

    function readStoredHandledCommandId() {
      try {
        return root.localStorage.getItem(handledCmdStorageKey) || '';
      } catch (e) {
        return '';
      }
    }

    function restorePersistedCommandGuards() {
      try {
        const id = readStoredHandledCommandId();
        if (!id) {
          return;
        }
        lastHandledCommandId = id;
        lastAckCommandId = id;
        pendingAckCommandId = id;
      } catch (e) {
        /* ignore */
      }
    }

    function persistHandledCommandRecord(cmd) {
      const id = cmd && cmd.id ? String(cmd.id) : '';
      if (!id) {
        return;
      }
      try {
        root.localStorage.setItem(handledCmdStorageKey, id);
      } catch (e) {
        /* ignore */
      }
      lastHandledCommandId = id;
      lastAckCommandId = id;
    }

    function awaitPersistHandledCommandRecord(cmd) {
      persistHandledCommandRecord(cmd);
      return Promise.resolve();
    }

    function getBootServerTimeMs() {
      if (!transport.session || !transport.session.getBootServerTimeMs) {
        return 0;
      }
      return transport.session.getBootServerTimeMs();
    }

    function shouldSkipReloadRebootByBootServerTime(cmd) {
      const skipFn = QMS.Receiver.shouldSkipReloadRebootByBootServerTime;
      if (!skipFn) {
        return false;
      }
      return skipFn(cmd, getBootServerTimeMs());
    }

    function shouldSkipDeviceCommand(cmd) {
      if (!cmd || !cmd.id) {
        return true;
      }
      const id = String(cmd.id);
      const storedId = readStoredHandledCommandId();
      if (id === lastHandledCommandId || id === storedId) {
        return true;
      }
      if (shouldSkipReloadRebootByBootServerTime(cmd)) {
        return true;
      }
      return false;
    }

    async function flushCommandAckBeforeReload() {
      try {
        await Promise.race([
          sendHeartbeat(),
          new Promise(function (resolve) {
            root.setTimeout(resolve, RELOAD_ACK_TIMEOUT_MS);
          }),
        ]);
      } catch (e) {
        /* ignore */
      }
    }

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

    function clearReceiverCache() {
      try {
        root.localStorage.removeItem(cacheKey);
      } catch (e) {
        /* ignore */
      }
    }

    function isUploadHalted() {
      const session = transport.session;
      return Boolean(session && session.isUploadHalted && session.isUploadHalted());
    }

    function syncCloudGuestStatusUi(offlineOverride) {
      if (!showCloudOfflineUi) {
        return;
      }
      const uploadHalted = isUploadHalted();
      let offline = false;
      if (simulateOffline) {
        offline = false;
      } else if (uploadHalted) {
        offline = false;
      } else if (offlineOverride === true) {
        offline = true;
      } else if (offlineOverride === false) {
        offline = false;
      } else {
        offline = !cloudReachable;
      }
      cloudOfflineUiVisible = offline;
      if (milkshaRuntime && typeof milkshaRuntime.setCloudOfflineVisible === 'function') {
        milkshaRuntime.setCloudOfflineVisible(offline);
      }
      if (milkshaRuntime && typeof milkshaRuntime.setCloudPausedVisible === 'function') {
        milkshaRuntime.setCloudPausedVisible(uploadHalted);
      }
      const doc = root.document;
      if (!doc) {
        return;
      }
      const stage = doc.getElementById('board-root') || doc.getElementById('rcv-stage');
      if (stage) {
        if (offline) {
          stage.setAttribute('data-cloud-offline', '1');
        } else {
          stage.removeAttribute('data-cloud-offline');
        }
        if (uploadHalted) {
          stage.setAttribute('data-cloud-paused', '1');
        } else {
          stage.removeAttribute('data-cloud-paused');
        }
      }
    }

    function syncCloudOfflineUi(offline) {
      syncCloudGuestStatusUi(offline);
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

    function boardUpdatedAtToMs(value) {
      if (QMS.Receiver.parseCommandTimeValue) {
        const parsed = QMS.Receiver.parseCommandTimeValue(value);
        if (parsed != null) {
          return parsed;
        }
      }
      if (typeof value === 'string' && value.trim()) {
        const ms = Date.parse(value);
        return Number.isFinite(ms) ? ms : 0;
      }
      return 0;
    }

    function noteAppliedCloudBoardUpdatedAt(updatedAt) {
      const ms = boardUpdatedAtToMs(updatedAt);
      if (ms > 0) {
        lastAppliedCloudBoardUpdatedAtMs = Math.max(lastAppliedCloudBoardUpdatedAtMs, ms);
      }
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

      let res;
      if (milkshaRuntime && typeof milkshaRuntime.applyPayload === 'function') {
        milkshaRuntime.applyPayload(list, { silent: ringOpts.silent });
        res = { isOK: true };
      } else if (demoApi && typeof demoApi.pushFromObject === 'function') {
        res = demoApi.pushFromObject(req, {
          skipOfflineCheck: true,
          newlyReadyIds: ringIds,
        });
      } else {
        return { isOK: false };
      }
      prevReadySet = nextReady;
      if (typeof seq === 'number') {
        localSeq = seq;
      }
      if (!(opts && opts.skipCacheWrite) && TodayBoard.hasSessionBusinessDate()) {
        saveCache(localSeq, list, opts && opts.boardUpdatedAt);
      }
      if (opts && opts.boardUpdatedAt) {
        noteAppliedCloudBoardUpdatedAt(opts.boardUpdatedAt);
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
      if (board.storeId && String(board.storeId) !== String(storeId)) {
        return { ignored: true, reason: 'wrong_store' };
      }
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
        const allowEqualSeqCatchUp = suppressRingOnNextApply && seq === localSeq;
        if (!allowEqualSeqCatchUp) {
          noteSeqForensics('tryApplyTodayBoard', {
            accept: false,
            reason: 'stale',
            incomingSeq: seq,
            localSeq,
          });
          return { ignored: true, reason: Validate.MSG.stale };
        }
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
      noteSeqForensics('tryApplyTodayBoard', {
        accept: true,
        incomingSeq: seq,
        localSeq,
        ticketCount: numberContent.length,
      });
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

    function authBlocksBoardSync() {
      const session = transport.session;
      if (!session) {
        return false;
      }
      if (session.isAuthStopped && session.isAuthStopped()) {
        return true;
      }
      if (session.isUploadHalted && session.isUploadHalted()) {
        return true;
      }
      return false;
    }

    function authBlocksHeartbeat() {
      const session = transport.session;
      if (!session) {
        return false;
      }
      if (session.isAuthStopped && session.isAuthStopped()) {
        return true;
      }
      if (session.isUploadHalted && session.isUploadHalted()) {
        return true;
      }
      return false;
    }

    function effectiveHeartbeatIntervalMs() {
      return heartbeatMs;
    }

    function scheduleHeartbeatLoop() {
      if (heartbeatTimer) {
        root.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      const intervalMs = effectiveHeartbeatIntervalMs();
      heartbeatTimer = root.setInterval(function () {
        sendHeartbeat();
      }, intervalMs);
    }

    function onVisibilityForHeartbeat() {
      if (!root.document || root.document.visibilityState !== 'visible') {
        sendHeartbeat();
        return;
      }
      scheduleCloudResync('visibility');
    }

    function onWindowOnline() {
      scheduleCloudResync('online');
    }

    function onWindowFocus() {
      scheduleCloudResync('focus');
    }

    function onPageShow(ev) {
      if (ev && ev.persisted) {
        scheduleCloudResync('pageshow');
        return;
      }
      scheduleCloudResync('pageshow');
    }

    function noteTickWallClock() {
      const now = Date.now();
      const gap = now - lastTickWallMs;
      lastTickWallMs = now;
      if (gap > 20000) {
        scheduleCloudResync('clock_gap');
      }
    }

    function attachReconnectListeners() {
      if (!root.addEventListener) {
        return;
      }
      root.addEventListener('online', onWindowOnline);
      reconnectHandlers.push(['online', onWindowOnline]);
      root.addEventListener('focus', onWindowFocus);
      reconnectHandlers.push(['focus', onWindowFocus]);
      root.addEventListener('pageshow', onPageShow);
      reconnectHandlers.push(['pageshow', onPageShow]);
    }

    function detachReconnectListeners() {
      if (!root.removeEventListener) {
        return;
      }
      for (let i = 0; i < reconnectHandlers.length; i += 1) {
        const pair = reconnectHandlers[i];
        root.removeEventListener(pair[0], pair[1]);
      }
      reconnectHandlers = [];
    }

    async function applyMissingCloudBoard(boardDoc) {
      revealGuestClockFromCloudBoard(boardDoc);
      const resolved = TodayBoard.resolveSessionBusinessDate({
        httpDateHeader: boardDoc.httpDate || '',
        httpDateReadable: Boolean(boardDoc.httpDateReadable),
      });
      if (!resolved.ok) {
        return;
      }
      noteResolvedBusinessDate(resolved);
      dropStaleCacheIfBusinessDayMismatch(resolved.businessDate);
      noteSessionBusinessDateRoll(resolved.businessDate);
      clearReceiverCache();
      // Cloud has no today_board yet: never bump localSeq or push empty apply (would
      // block the first real board when seq is small).
    }

    function markCloudReachable() {
      const wasOffline = !cloudReachable;
      cloudReachable = true;
      if (wasOffline) {
        syncCloudOfflineUi(false);
      }
      tryFlushDeferredReloadCommand();
    }

    function isAuthHttpError(err) {
      const status = err && err.status ? Number(err.status) : 0;
      return status === 401 || status === 403;
    }

    function isPermissionOrAuthFailure(err) {
      if (authBlocksBoardSync() || authBlocksHeartbeat()) {
        return true;
      }
      if (isAuthHttpError(err)) {
        return true;
      }
      const msg = err && err.message ? String(err.message) : '';
      if (msg.indexOf('Firestore GET 401') >= 0 || msg.indexOf('Firestore GET 403') >= 0) {
        return true;
      }
      const response = err && err.response ? err.response : null;
      const code = response && response.code != null ? String(response.code) : '';
      if (code === 'store_not_allowed' || code === 'upload_halted' || code === 'forbidden') {
        return true;
      }
      return false;
    }

    function markCloudUnreachable(err) {
      if (simulateOffline) {
        return;
      }
      if (isUploadHalted()) {
        cloudReachable = true;
        syncCloudGuestStatusUi(false);
        return;
      }
      cloudReachable = false;
      if (isPermissionOrAuthFailure(err)) {
        syncCloudGuestStatusUi(false);
        return;
      }
      syncCloudGuestStatusUi(true);
    }

    function scheduleCloudResync(reason) {
      if (simulateOffline || authBlocksBoardSync()) {
        return Promise.resolve();
      }
      if (resyncInFlight) {
        return resyncInFlight;
      }
      const recoveryOffline = !cloudReachable;
      if (recoveryOffline) {
        syncCloudOfflineUi(true);
      }
      lastBoardUpdateTime = '';
      const kick = function () {
        sendHeartbeat();
        const refetch =
          firestoreRealtime && firestoreRealtime.forceRefetch
            ? firestoreRealtime.forceRefetch()
            : Promise.resolve();
        return refetch
          .then(function () {
            return pollBoard({ force: true });
          })
          .then(function () {
            if (commandListenMode === 'poll') {
              return pollDevice();
            }
            return undefined;
          });
      };
      if (onCloudResync) {
        resyncInFlight = Promise.resolve()
          .then(function () {
            return onCloudResync(reason);
          })
          .catch(function () {
            return kick();
          })
          .finally(function () {
            resyncInFlight = null;
          });
        return resyncInFlight;
      }
      resyncInFlight = kick().finally(function () {
        resyncInFlight = null;
      });
      return resyncInFlight;
    }

    function notifyAuthFailure(err) {
      onAuthFailure(err);
    }

    async function tryFlushDeferredReloadCommand() {
      if (!deferredReloadCommand || simulateOffline || !lastHeartbeatSucceeded) {
        return;
      }
      const cmd = deferredReloadCommand;
      deferredReloadCommand = null;
      if (shouldSkipDeviceCommand(cmd)) {
        await acknowledgeSkippedPendingCommand(cmd);
        return;
      }
      await handleCommand(cmd);
    }

    async function applyBoardDocument(board, pollOpts) {
      const forcePoll = Boolean(pollOpts && pollOpts.force);
      if (!board) {
        onStatusLine('board: 無名單');
        return;
      }
      if (board.missing) {
        onStatusLine('board: 無名單');
        if (milkshaRuntime || showCloudOfflineUi) {
          await applyMissingCloudBoard(board);
          lastBoardUpdateTime = 'missing:' + (board.httpDate || Date.now());
        } else {
          revealGuestClockFromCloudBoard(board);
        }
        markCloudReachable();
        return;
      }
      const marker = board.updateTime || board.data.updatedAt || String(board.data.seq || '');
      if (!forcePoll && marker && marker === lastBoardUpdateTime) {
        markCloudReachable();
        return;
      }
      lastBoardUpdateTime = marker;
      revealGuestClockFromCloudBoard(board);
      const tickets = board.data.tickets;
      const ticketList = Array.isArray(tickets) ? tickets : [];
      if (ticketList.length === 0) {
        clearReceiverCache();
      }
      await tryApplyTodayBoard(board);
      markCloudReachable();
    }

    async function pollBoard(pollOpts) {
      const forcePoll = Boolean(pollOpts && pollOpts.force);
      if (authBlocksBoardSync()) {
        syncCloudGuestStatusUi(false);
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
        await applyBoardDocument(board, { force: forcePoll });
      } catch (e) {
        if (!isFirestoreAbortError(e)) {
          if (isAuthHttpError(e)) {
            notifyAuthFailure(e);
            syncCloudGuestStatusUi(false);
          }
          markCloudUnreachable(e);
        }
        onStatusLine('board 錯誤: ' + (e && e.message ? e.message : 'unknown'));
      }
    }

    function enterPollFallback() {
      boardListenActive = false;
      commandListenMode = 'poll';
      if (firestoreRealtime) {
        firestoreRealtime.stop();
        firestoreRealtime = null;
      }
    }

    function enterCommandPollFallback() {
      commandListenMode = 'poll';
      if (firestoreRealtime && firestoreRealtime.stopCommandListener) {
        firestoreRealtime.stopCommandListener();
      }
    }

    async function handleRealtimeCommand(cmd, deviceData) {
      if (!cmd || !cmd.id) {
        return;
      }
      if (shouldSkipDeviceCommand(cmd)) {
        await acknowledgeSkippedPendingCommand(cmd);
        return;
      }
      try {
        await handleCommand(cmd, deviceData);
        await sendHeartbeat();
      } catch (e) {
        onStatusLine('command 錯誤: ' + (e && e.message ? e.message : 'unknown'));
      }
    }

    async function startFirestoreRealtimeIfPossible() {
      if (isRealtimeQueryDisabled()) {
        return;
      }
      if (boardListenActive) {
        return;
      }
      if (firestoreRealtime) {
        firestoreRealtime.stop();
        firestoreRealtime = null;
      }
      const Realtime = QMS.Transport.FirestoreRealtime;
      const Bridge = QMS.Transport.FirebaseSdkBridge;
      if (!Realtime || !Realtime.createFirestoreRealtimeListener) {
        return;
      }
      if (!Bridge || !Bridge.isSdkLoaded()) {
        return;
      }
      if (!transport.session || !transport.session.ensureIdToken) {
        return;
      }
      try {
        await transport.session.ensureIdToken();
      } catch (e) {
        return;
      }
      let firebaseConfig = options.firebaseConfig || null;
      if (!firebaseConfig && root.MILKSHA_FIREBASE_CONFIG) {
        firebaseConfig = root.MILKSHA_FIREBASE_CONFIG;
      }
      if (!firebaseConfig) {
        return;
      }
      firestoreRealtime = Realtime.createFirestoreRealtimeListener({
        config: firebaseConfig,
        storeId: storeId,
        deviceId: deviceId,
        session: transport.session,
        onBoardSnapshot: function (boardDoc) {
          if (authBlocksBoardSync() || simulateOffline) {
            return;
          }
          applyBoardDocument(boardDoc, { force: false }).catch(function () {
            /* ignore */
          });
        },
        onCommandSnapshot: function (cmd, deviceData) {
          if (authBlocksBoardSync() || simulateOffline) {
            return;
          }
          handleRealtimeCommand(cmd, deviceData).catch(function () {
            /* ignore */
          });
        },
        onBoardFallback: function () {
          enterPollFallback();
        },
        onCommandPollFallback: function () {
          enterCommandPollFallback();
        },
        onListenerError: function (err) {
          if (isAuthHttpError(err)) {
            notifyAuthFailure(err);
          }
        },
      });
      const mode = await firestoreRealtime.start();
      boardListenActive = Boolean(mode.boardListen);
      commandListenMode = mode.commandMode || 'poll';
      if (!boardListenActive) {
        enterPollFallback();
      } else if (commandListenMode === 'poll') {
        enterCommandPollFallback();
      }
    }

    function positiveSeq(value) {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) {
        return 0;
      }
      return n;
    }

    function noteSeqForensics(kind, detail) {
      if (!root.__RCV_SEQ_FORENSICS) {
        return;
      }
      root.__RCV_SEQ_FORENSICS.push({
        at: Date.now(),
        kind: kind,
        detail: detail,
      });
    }

    async function resolveCommandBoardSeq(cmd, deviceData) {
      const fromCmd = cmd && Object.prototype.hasOwnProperty.call(cmd, 'boardSeq')
        ? positiveSeq(cmd.boardSeq)
        : 0;
      if (fromCmd > 0) {
        noteSeqForensics('resolveCommandBoardSeq', { pick: 'cmd.boardSeq', seq: fromCmd });
        return fromCmd;
      }
      const fromDev =
        deviceData && Object.prototype.hasOwnProperty.call(deviceData, 'boardSeq')
          ? positiveSeq(deviceData.boardSeq)
          : 0;
      let cloudSeq = 0;
      try {
        const snap = await transport.readBoard();
        cloudSeq = snap && snap.data ? positiveSeq(snap.data.seq) : 0;
      } catch (e) {
        /* ignore */
      }
      const bumped = localSeq > 0 ? localSeq + 1 : 1;
      if (cloudSeq > 0) {
        if (fromDev > 0 && fromDev >= cloudSeq && fromDev >= localSeq) {
          noteSeqForensics('resolveCommandBoardSeq', {
            pick: 'device.boardSeq',
            seq: fromDev,
            cloudSeq,
            localSeq,
          });
          return fromDev;
        }
        const picked = Math.max(cloudSeq, bumped);
        noteSeqForensics('resolveCommandBoardSeq', {
          pick: fromDev > 0 && fromDev < cloudSeq ? 'cloudSeq(stale device.boardSeq)' : 'cloudSeq',
          seq: picked,
          cloudSeq,
          deviceBoardSeq: fromDev,
          localSeq,
        });
        return picked;
      }
      if (fromDev > 0 && fromDev >= localSeq) {
        noteSeqForensics('resolveCommandBoardSeq', { pick: 'device.boardSeq', seq: fromDev });
        return fromDev;
      }
      noteSeqForensics('resolveCommandBoardSeq', { pick: 'localSeq+1', seq: bumped });
      return bumped;
    }

    async function handleCommand(cmd, deviceData) {
      const type = cmd.type;
      const params = cmd.params || {};
      if (type === 'reload' || type === 'reboot') {
        if (shouldSkipReloadRebootByBootServerTime(cmd)) {
          await acknowledgeSkippedPendingCommand(cmd);
          return;
        }
        if (simulateOffline) {
          deferredReloadCommand = cmd;
          return;
        }
        if (!lastHeartbeatSucceeded) {
          deferredReloadCommand = cmd;
          return;
        }
        pendingAckCommandId = cmd.id ? String(cmd.id) : '';
        await awaitPersistHandledCommandRecord(cmd);
        await flushCommandAckBeforeReload();
        if (type === 'reload') {
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
          return;
        }
        if (root.AndroidBridge && typeof root.AndroidBridge.reboot === 'function') {
          root.AndroidBridge.reboot();
        } else {
          root.location.reload();
        }
        return;
      }
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
          if (boardSnap) {
            await applyBoardDocument(boardSnap, { force: true });
          }
        } catch (e) {
          /* ignore */
        }
      } else if (type === 'slow') {
        networkDelayMs = Number(params.delayMs) || 3000;
      } else if (type === 'clear_now') {
        const cmdMs = QMS.Receiver.commandServerTimeMs
          ? QMS.Receiver.commandServerTimeMs(cmd)
          : null;
        const fromCmd = Number(cmd.boardSeq);
        const fromDev =
          deviceData && deviceData.boardSeq != null ? Number(deviceData.boardSeq) : 0;
        let boardUpdatedAt = '';
        let snap = null;
        try {
          snap = await transport.readBoard();
        } catch (e) {
          /* ignore */
        }
        const tickets =
          snap && snap.data && Array.isArray(snap.data.tickets) ? snap.data.tickets : [];
        if (tickets.length > 0) {
          const cloudMs = boardUpdatedAtToMs(snap.data.updatedAt);
          if (cmdMs != null && cloudMs > 0 && cmdMs < cloudMs) {
            await acknowledgeSkippedPendingCommand(cmd);
            return;
          }
          const cloudSeq = Number(snap.data.seq);
          const intentSeq = Math.max(
            Number.isFinite(fromCmd) && fromCmd > 0 ? fromCmd : 0,
            Number.isFinite(fromDev) && fromDev > 0 ? fromDev : 0,
          );
          if (Number.isFinite(cloudSeq) && intentSeq > 0 && cloudSeq > intentSeq) {
            await acknowledgeSkippedPendingCommand(cmd);
            return;
          }
        } else if (
          cmdMs != null &&
          lastAppliedCloudBoardUpdatedAtMs > 0 &&
          cmdMs < lastAppliedCloudBoardUpdatedAtMs
        ) {
          await acknowledgeSkippedPendingCommand(cmd);
          return;
        }
        let applySeq = 0;
        if (Number.isFinite(fromCmd) && fromCmd > 0) {
          applySeq = fromCmd;
        }
        if (Number.isFinite(fromDev) && fromDev > applySeq) {
          applySeq = fromDev;
        }
        if (snap && snap.data && tickets.length === 0) {
          const cloudSeq = Number(snap.data.seq);
          if (Number.isFinite(cloudSeq) && cloudSeq > applySeq) {
            applySeq = cloudSeq;
          }
          boardUpdatedAt = snap.data.updatedAt || '';
        }
        if (!(applySeq > 0)) {
          applySeq = await resolveCommandBoardSeq(cmd, deviceData);
        }
        applyNumberContent([], applySeq, { silent: true, boardUpdatedAt });
        noteAppliedCloudBoardUpdatedAt(boardUpdatedAt);
      } else if (type === 'push_numbers') {
        const ready = Array.isArray(params.ready) ? params.ready : [];
        const preparing = Array.isArray(params.preparing) ? params.preparing : [];
        const nc = [];
        ready.forEach(function (no) {
          nc.push({ source_type: 'From_Store_OK', number: String(no) });
        });
        preparing.forEach(function (no) {
          nc.push({ source_type: 'From_Store_Preparing', number: String(no) });
        });
        const seq = await resolveCommandBoardSeq(cmd, deviceData);
        applyNumberContent(nc, seq, { silent: false });
        try {
          const snap = await transport.readBoard();
          if (snap && snap.data && snap.data.updatedAt) {
            noteAppliedCloudBoardUpdatedAt(snap.data.updatedAt);
          }
        } catch (e) {
          /* ignore */
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

    async function acknowledgeSkippedPendingCommand(cmd) {
      if (!cmd || !cmd.id) {
        return;
      }
      pendingAckCommandId = String(cmd.id);
      const type = cmd && cmd.type ? String(cmd.type) : '';
      if (type === 'reload' || type === 'reboot') {
        await awaitPersistHandledCommandRecord(cmd);
      }
      await sendHeartbeat();
    }

    async function pollDevice() {
      if (authBlocksBoardSync()) {
        return;
      }
      try {
        const dev = await transport.readDevice(deviceId);
        if (!dev || !dev.data) {
          return;
        }
        markCloudReachable();
        const pending = dev.data.pendingCommand;
        if (!pending || !pending.id) {
          return;
        }
        if (shouldSkipDeviceCommand(pending)) {
          await acknowledgeSkippedPendingCommand(pending);
          return;
        }
        await handleCommand(pending, dev.data);
        await sendHeartbeat();
      } catch (e) {
        if (isFirestoreAbortError(e)) {
          return;
        }
        if (isAuthHttpError(e)) {
          notifyAuthFailure(e);
        }
        markCloudUnreachable(e);
        onStatusLine('device 錯誤: ' + (e && e.message ? e.message : 'unknown'));
      }
    }

    async function sendHeartbeat() {
      if (authBlocksHeartbeat()) {
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
          simulatedOffline: simulateOffline || cloudOfflineUiVisible,
          ackCommandId: ack,
        });
        if (pendingAckCommandId) {
          lastAckCommandId = pendingAckCommandId;
          pendingAckCommandId = '';
        }
        lastHeartbeatSucceeded = true;
        markCloudReachable();
        tryFlushDeferredReloadCommand();
      } catch (e) {
        lastHeartbeatSucceeded = false;
        if (isAuthHttpError(e)) {
          notifyAuthFailure(e);
          syncCloudGuestStatusUi(false);
        }
        markCloudUnreachable(e);
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
      try {
        if (new URLSearchParams(root.location.search).get('forensics') === '1') {
          root.__RCV_SEQ_FORENSICS = root.__RCV_SEQ_FORENSICS || [];
        }
      } catch (e) {
        /* ignore */
      }
      restorePersistedCommandGuards();
      setSimulatedOfflineFlag(false);
      TodayBoard.clearSessionBusinessDate();
      lastSessionBusinessDate = '';
      lastResolvedBusinessDate = '';
      lastResolvedSource = '';
      clockSkewSilentRefetchPending = false;

      if (!skipBootReceiverCache) {
        tryApplyBootCache();
      } else if (milkshaRuntime && typeof milkshaRuntime.applyPayload === 'function') {
        milkshaRuntime.applyPayload([], { silent: true });
      }
      syncGuestClockAfterBoot();

      const kick = function () {
        sendHeartbeat();
        pollBoard();
        pollDevice();
      };
      if (!skipInitialCloudKick) {
        ensureAuth()
          .then(function () {
            return startFirestoreRealtimeIfPossible();
          })
          .then(kick)
          .catch(kick);
      }

      fastBoardPollTimer = root.setInterval(function () {
        if (boardListenActive) {
          if (fastBoardPollTimer) {
            root.clearInterval(fastBoardPollTimer);
            fastBoardPollTimer = null;
          }
          return;
        }
        if (Date.now() - bootWallMs > FAST_BOARD_POLL_WINDOW_MS) {
          if (fastBoardPollTimer) {
            root.clearInterval(fastBoardPollTimer);
            fastBoardPollTimer = null;
          }
          return;
        }
        pollBoard({ force: false });
      }, FAST_BOARD_POLL_MS);

      scheduleHeartbeatLoop();
      if (root.document && root.document.addEventListener) {
        visibilityHandler = onVisibilityForHeartbeat;
        root.document.addEventListener('visibilitychange', visibilityHandler);
      }
      if (onCloudResync || showCloudOfflineUi) {
        attachReconnectListeners();
      }

      tickTimer = setInterval(function () {
        tickMs += 1000;
        noteTickWallClock();
        onSyncAuthUi();
        syncCloudGuestStatusUi();
        if (
          commandListenMode === 'poll' &&
          !pauseAutoDevicePoll &&
          tickMs % devicePollMs === 0
        ) {
          pollDevice();
        }
        const boardPollEvery = boardListenActive ? FALLBACK_BOARD_POLL_MS : boardPollMs;
        if (tickMs % boardPollEvery === 0) {
          pollBoard();
        }
      }, 1000);
    }

    function destroy() {
      if (heartbeatTimer) {
        root.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (visibilityHandler && root.document && root.document.removeEventListener) {
        root.document.removeEventListener('visibilitychange', visibilityHandler);
        visibilityHandler = null;
      }
      detachReconnectListeners();
      if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
      }
      if (fastBoardPollTimer) {
        root.clearInterval(fastBoardPollTimer);
        fastBoardPollTimer = null;
      }
      if (slowNetworkTimer) {
        clearTimeout(slowNetworkTimer);
      }
      enterPollFallback();
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
      refreshGuestCloudStatus: function () {
        syncCloudGuestStatusUi();
      },
      receiveBoard: receiveBoard,
      triggerBoardPoll: function (pollOpts) {
        return pollBoard(pollOpts);
      },
      scheduleCloudResync: scheduleCloudResync,
      isCloudReachable: function () {
        return cloudReachable;
      },
      isCloudOfflineUiVisible: function () {
        return cloudOfflineUiVisible;
      },
      triggerDevicePoll: function () {
        return pollDevice();
      },
      getLocalSeq: function () {
        return localSeq;
      },
      getRuntimeVersion: function () {
        return VERSION;
      },
      getRealtimeStats: function () {
        const base = {
          boardListen: boardListenActive,
          commandMode: commandListenMode,
          realtimeDisabled: isRealtimeQueryDisabled(),
          readCounts: { board: 0, command: 0 },
        };
        if (!firestoreRealtime || !firestoreRealtime.getStats) {
          return base;
        }
        const stats = firestoreRealtime.getStats();
        stats.realtimeDisabled = isRealtimeQueryDisabled();
        return stats;
      },
      isSimulatedOffline: function () {
        return simulateOffline;
      },
      sendHeartbeat: function () {
        return sendHeartbeat();
      },
    };
    if (options.enableTestPollHook) {
      api.sendHeartbeatForTests = function () {
        return sendHeartbeat();
      };
      api.pollDeviceForTests = async function () {
        const blocked = authBlocksBoardSync();
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
