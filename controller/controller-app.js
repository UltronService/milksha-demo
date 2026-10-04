(function () {
  'use strict';

  const Validate = window.QMS.Receiver.Validate;
  const TodayBoard = window.QMS.Board.TodayBoard;
  const PosSign = window.QMS.Transport.MilkshaPosSign;

  const SOURCE_OPTIONS = [
    { key: 'store', label: '現場', preparing: 'From_Store_Preparing', ok: 'From_Store_OK' },
    { key: 'point', label: '迷點', preparing: 'From_milksha_point_Preparing', ok: 'From_milksha_point_OK' },
    { key: 'fp', label: '熊貓', preparing: 'From_FoodPanda_Preparing', ok: 'From_FoodPanda_OK' },
    { key: 'uber', label: 'Uber Eats', preparing: 'From_UberEat_Preparing', ok: 'From_UberEat_OK' },
    { key: 'udd', label: 'UDD', preparing: 'From_Udd_Preparing', ok: 'From_Udd_OK' },
  ];

  let transport = null;
  /** @type {Array<{ no: string, status: string, sourceKey: string, updatedAt: string }>} */
  let tickets = [];
  let logEntries = [];
  let logFilter = '';
  let connected = false;
  let lastBoardSeq = 0;
  let lastHeartbeatAt = '';
  let deviceOnline = false;
  let boardLinkHint = '';
  let pauseCloud = false;
  let pollTimer = null;
  let clockTimer = null;
  let commandInFlight = false;

  const LOG_KEY = 'milksha:controller:logs';
  const CmdErrors = window.QMS.Transport.ControllerCommandErrors;

  window.__controllerTelemetry = {
    connected: false,
    lastBoardSeq: 0,
    pauseCloud: false,
    lastPosResponse: null,
    isCommandInFlight: function () {
      return commandInFlight;
    },
  };

  function loadLogs() {
    try {
      logEntries = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    } catch (e) {
      logEntries = [];
    }
    renderLogs();
  }

  function pushLog(entry) {
    logEntries.unshift(Object.assign({ at: new Date().toISOString() }, entry));
    logEntries = logEntries.slice(0, 400);
    localStorage.setItem(LOG_KEY, JSON.stringify(logEntries));
    renderLogs();
  }

  function renderLogs() {
    const ul = document.getElementById('log-list');
    ul.innerHTML = '';
    const q = (logFilter || '').toLowerCase();
    logEntries
      .filter(function (e) {
        if (!q) return true;
        const text = (e.summary || '') + (e.kind || '');
        return text.toLowerCase().indexOf(q) !== -1;
      })
      .slice(0, 80)
      .forEach(function (e) {
        const li = document.createElement('li');
        const at = e.at ? TodayBoard.formatTaipeiDateTimeHuman(e.at) : '';
        li.textContent = (at || '') + ' · ' + (e.summary || JSON.stringify(e));
        ul.appendChild(li);
      });
  }

  const CloudSettings = window.QMS.Transport.CloudSettings;
  const ControllerSecrets = window.QMS.Transport.ControllerSecrets;

  function modeDisplayName(mode) {
    if (mode === 'cloud') {
      return '雲端模式';
    }
    if (mode === 'firestore') {
      return '本機模擬雲端';
    }
    return '本機連動';
  }

  function readCloudForm() {
    const saved = CloudSettings.load();
    const prefixEl = document.getElementById('fld-emulator-prefix');
    const prefixFromField = prefixEl ? prefixEl.value.trim() : '';
    return {
      projectId: document.getElementById('fld-cloud-project').value.trim(),
      apiKey: document.getElementById('fld-cloud-apikey').value.trim(),
      region: document.getElementById('fld-cloud-region').value.trim() || 'asia-east1',
      accessCode: document.getElementById('fld-code').value.trim(),
      useEmulator: document.getElementById('fld-use-emulator').checked,
      gateway: document.getElementById('fld-gateway').value.trim(),
      emulatorPrefix: prefixFromField || saved.emulatorPrefix || '',
    };
  }

  function fillCloudForm(settings) {
    const s = settings || CloudSettings.load();
    document.getElementById('fld-cloud-project').value = s.projectId || '';
    document.getElementById('fld-cloud-apikey').value = s.apiKey || '';
    document.getElementById('fld-cloud-region').value = s.region || 'asia-east1';
    document.getElementById('fld-code').value = s.accessCode || '';
    document.getElementById('fld-use-emulator').checked = Boolean(s.useEmulator);
    document.getElementById('fld-gateway').value = s.gateway || '';
    const posEl = document.getElementById('fld-pos-sign-key');
    if (posEl && ControllerSecrets) {
      posEl.value = ControllerSecrets.loadPosSignSecret();
    }
  }

  function persistCloudForm() {
    CloudSettings.save(readCloudForm());
    if (ControllerSecrets) {
      ControllerSecrets.savePosSignSecret(document.getElementById('fld-pos-sign-key').value);
    }
  }

  function syncCloudUi() {
    const mode = document.getElementById('fld-mode').value;
    const prompt = document.getElementById('cloud-config-prompt');
    const linkBlock = document.getElementById('board-link-block');
    const incomplete = !CloudSettings.isComplete(readCloudForm());
    if (prompt) {
      prompt.hidden = mode !== 'cloud' || !incomplete;
    }
    if (linkBlock) {
      linkBlock.hidden = mode !== 'cloud' || incomplete;
    }
    syncLocalModeNotice();
  }

  function siteBaseUrl() {
    const path = window.location.pathname.replace(/\/controller\/?.*$/, '/');
    return window.location.origin + path;
  }

  function drawQrCanvas(canvas, text) {
    if (!window.qrcode || !canvas) {
      return;
    }
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const cell = Math.max(2, Math.floor(160 / n));
    canvas.width = n * cell;
    canvas.height = n * cell;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        if (qr.isDark(r, c)) {
          ctx.fillRect(c * cell, r * cell, cell, cell);
        }
      }
    }
  }

  function updateBoardLinks() {
    const device = document.getElementById('fld-device').value.trim() || 'stb-01';
    const store = storeId();
    const simple =
      siteBaseUrl() +
      'receiver-demo/?store=' +
      encodeURIComponent(store) +
      '&mode=cloud&device=' +
      encodeURIComponent(device);
    const setup = simple + '#cfg=' + CloudSettings.encodeCfgHash(readCloudForm());
    document.getElementById('fld-board-simple-url').value = simple;
    document.getElementById('fld-board-setup-url').value = setup;
    drawQrCanvas(document.getElementById('board-setup-qr'), setup);
  }

  function showUserBanner(text) {
    const el = document.getElementById('user-banner');
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.textContent = text;
    el.hidden = false;
  }

  const POS_SEND_BUTTON_IDS = new Set([
    'btn-send-numbers',
    'btn-add-ticket',
    'btn-one-ready',
    'btn-pickup-scan',
    'btn-send-board',
    'btn-clear-board',
    'btn-gen-normal',
    'btn-gen-peak',
    'btn-send-tammy',
    'btn-bad-sign',
    'btn-bad-store',
    'btn-bad-format',
    'btn-dup-list',
  ]);

  const PAUSE_CLOUD_EXEMPT_BUTTON_IDS = new Set([
    'btn-cable-pull',
    'btn-cable-restore',
    'btn-export-json',
    'btn-export-csv',
    'btn-clear-log',
    'btn-connect',
    'btn-gen-board-link',
  ]);

  function usesOutboundApi(buttonId) {
    if (PAUSE_CLOUD_EXEMPT_BUTTON_IDS.has(buttonId)) {
      return false;
    }
    if (buttonId === 'btn-refresh-logs') {
      return false;
    }
    const btn = document.getElementById(buttonId);
    if (!btn) {
      return false;
    }
    return btn.hasAttribute('data-requires-connect') || btn.getAttribute('data-dev-command') === '1';
  }

  function initActionBlockReasons() {
    document.querySelectorAll('main button[type="button"][id]').forEach(function (btn) {
      const next = btn.nextElementSibling;
      if (next && next.classList && next.classList.contains('action-block-reason')) {
        return;
      }
      const span = document.createElement('span');
      span.className = 'action-block-reason';
      span.hidden = true;
      span.setAttribute('data-testid', btn.id + '-block-reason');
      btn.insertAdjacentElement('afterend', span);
    });
  }

  function getActionBlockReason(btn) {
    if (!btn || !btn.id) {
      return '';
    }
    const id = btn.id;
    if (id === 'btn-connect' && connectInFlight) {
      return '連線中…';
    }
    if (btn.hasAttribute('data-requires-connect') && !connected) {
      return '請先按連線';
    }
    if (commandInFlight && btn.getAttribute('data-dev-command') === '1') {
      return '指令送出中…';
    }
    if (posInFlight && POS_SEND_BUTTON_IDS.has(id)) {
      return '上一筆叫號仍在送出中';
    }
    if (pauseCloud && usesOutboundApi(id)) {
      return '拔線測試中，API 已暫停';
    }
    return '';
  }

  function syncActionButtonStates() {
    document.querySelectorAll('main button[type="button"][id]').forEach(function (btn) {
      const reason = getActionBlockReason(btn);
      const next = btn.nextElementSibling;
      const reasonEl = next && next.classList && next.classList.contains('action-block-reason') ? next : null;
      const shouldDisable =
        Boolean(reason) &&
        (btn.hasAttribute('data-requires-connect') ||
          btn.getAttribute('data-dev-command') === '1' ||
          btn.id === 'btn-connect');
      if (shouldDisable) {
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
        if (reasonEl) {
          reasonEl.textContent = reason;
          reasonEl.hidden = false;
        }
      } else {
        btn.disabled = false;
        btn.removeAttribute('aria-disabled');
        if (reasonEl) {
          reasonEl.textContent = '';
          reasonEl.hidden = true;
        }
      }
    });
  }

  function setCommandButtonsDisabled(disabled) {
    void disabled;
    syncActionButtonStates();
  }

  function hideCommandErrorAlert() {
    const box = document.getElementById('command-error-alert');
    if (!box) {
      return;
    }
    box.hidden = true;
    const msg = document.querySelector('[data-testid="command-error-message"]');
    const detail = document.querySelector('[data-testid="command-error-detail"]');
    if (msg) {
      msg.textContent = '';
    }
    if (detail) {
      detail.textContent = '';
    }
  }

  function showCommandErrorAlert(opts) {
    const box = document.getElementById('command-error-alert');
    const msgEl = document.querySelector('[data-testid="command-error-message"]');
    const detailEl = document.querySelector('[data-testid="command-error-detail"]');
    if (!box || !msgEl || !detailEl) {
      return;
    }
    msgEl.textContent = opts.userMessage || '';
    const status = opts.status ? Number(opts.status) : 0;
    if (CmdErrors && CmdErrors.formatErrorDetailText) {
      detailEl.textContent = CmdErrors.formatErrorDetailText(status, opts.response);
    } else {
      detailEl.textContent = JSON.stringify({ httpStatus: status, response: opts.response || {} }, null, 2);
    }
    box.hidden = false;
  }

  function presentConnectError(err) {
    const status = err && err.status ? Number(err.status) : 0;
    const response = err && err.response ? err.response : null;
    const userMessage =
      CmdErrors && CmdErrors.connectUserMessage
        ? CmdErrors.connectUserMessage(err)
        : err && err.message
          ? String(err.message)
          : '雲端暫時出錯。請稍後再連線。';
    showCommandErrorAlert({ userMessage: userMessage, status: status, response: response });
    pushLog({ summary: '連線失敗 · ' + userMessage });
  }

  function presentDevCommandError(err, validationCode) {
    const status = err && err.status ? Number(err.status) : 0;
    const response = err && err.response ? err.response : null;
    const userMessage =
      CmdErrors && CmdErrors.devCommandUserMessage
        ? CmdErrors.devCommandUserMessage(err, { validationCode: validationCode })
        : err && err.message
          ? String(err.message)
          : '指令送出失敗';
    showCommandErrorAlert({ userMessage: userMessage, status: status, response: response });
    pushLog({ summary: '指令失敗 · ' + userMessage, kind: 'command' });
  }

  function requireConnect() {
    if (connected) {
      showUserBanner('');
      return true;
    }
    showUserBanner('請先按連線');
    return false;
  }

  function setConnectedState(isOn, mode) {
    connected = isOn;
    const el = document.getElementById('online-state');
    el.setAttribute('data-connected', isOn ? '1' : '0');
    if (isOn) {
      const boardStateLabel = boardLinkHint
        ? boardLinkHint
        : deviceOnline
          ? '在線'
          : '離線/未知';
      el.textContent =
        '已連線（' +
        modeDisplayName(mode) +
        '）· 看板 ' +
        boardStateLabel +
        (lastHeartbeatAt && !boardLinkHint ? ' · 最後心跳 ' + lastHeartbeatAt : '');
      showUserBanner('');
    } else {
      el.textContent = '尚未連線';
    }
    window.__controllerTelemetry.connected = isOn;
    syncActionButtonStates();
  }

  async function ensureLocalPocDeviceStub() {
    const mode = document.getElementById('fld-mode').value;
    if (mode !== 'local' || !transport || !transport.cloudApi || !transport.cloudApi.boxHeartbeat) {
      return;
    }
    const deviceId = document.getElementById('fld-device').value.trim() || 'stb-01';
    const Coord = window.QMS.Transport.LocalPocCoord;
    if (Coord) {
      const foreign = Coord.findForeignRecentHeartbeat(
        window.localStorage,
        storeId(),
        heartbeatTimeoutMs(),
      );
      if (foreign) {
        return;
      }
    }
    try {
      const existing = await transport.readDevice(deviceId);
      if (existing && existing.data) {
        return;
      }
    } catch (e) {
      /* fall through to create stub */
    }
    await transport.cloudApi.boxHeartbeat({
      storeId: storeId(),
      deviceId: deviceId,
      appVersion: 'controller-local-stub',
      boardSeq: lastBoardSeq || 0,
      pendingUploads: 0,
      simulatedOffline: false,
    });
    pushLog({ summary: '本機連動：已建立看板裝置紀錄（' + deviceId + '）' });
  }

  function heartbeatTimeoutMs() {
    const sec = Number(document.getElementById('fld-heartbeat-timeout').value) || 120;
    const base = Math.max(5, sec) * 1000;
    const modeEl = document.getElementById('fld-mode');
    if (modeEl && modeEl.value === 'local') {
      const localStale =
        window.QMS.Transport && window.QMS.Transport.LOCAL_DEVICE_STALE_MS
          ? window.QMS.Transport.LOCAL_DEVICE_STALE_MS
          : 300000;
      return Math.max(base, localStale);
    }
    return base;
  }

  function formatTaipeiNow() {
    return TodayBoard.formatTaipeiDateTimeHuman(new Date());
  }

  function formatHeartbeatDisplay(iso) {
    return TodayBoard.formatTaipeiDateTimeHuman(iso);
  }

  function tickClock() {
    document.getElementById('status-taipei-time').textContent = formatTaipeiNow();
    document.getElementById('status-board-seq').textContent = String(lastBoardSeq);
    document.getElementById('status-heartbeat-at').textContent = lastHeartbeatAt || '—';
  }

  function ticketSourceKey(t) {
    if (t.sourceKey) {
      return t.sourceKey;
    }
    if (t.source_type) {
      const parsed = Validate.parseSourceType(t.source_type);
      if (parsed) {
        return parsed.sourceKey;
      }
    }
    return 'store';
  }

  function usedOrderNumbers() {
    const set = new Set();
    tickets.forEach(function (t) {
      set.add(String(t.no));
    });
    return set;
  }

  function allocateOrderNumber() {
    let n = Number(document.getElementById('fld-no').value);
    if (!Number.isFinite(n)) {
      n = 2001;
    }
    const used = usedOrderNumbers();
    while (used.has(String(n))) {
      n += 1;
    }
    return String(n);
  }

  function bumpNumberFieldAfterSend(sentNo) {
    let next = Number(sentNo);
    if (!Number.isFinite(next)) {
      next = Number(document.getElementById('fld-no').value) || 2000;
    }
    next += 1;
    const used = usedOrderNumbers();
    while (used.has(String(next))) {
      next += 1;
    }
    document.getElementById('fld-no').value = String(next);
  }

  function buildConfig(mode) {
    const m = mode || document.getElementById('fld-mode').value;
    persistCloudForm();
    const params = new URLSearchParams(window.location.search);
    const form = readCloudForm();
    if (form.gateway) {
      params.set('gateway', form.gateway);
    }
    if (form.apiKey) {
      params.set('key', form.apiKey);
    }
    if (form.projectId) {
      params.set('project', form.projectId);
    }
    const base = window.MILKSHA_FIREBASE_CONFIG || {};
    let posSecret = ControllerSecrets ? ControllerSecrets.loadPosSignSecret() : '';
    const modeEl = document.getElementById('fld-mode');
    const modeVal = mode || (modeEl ? modeEl.value : 'local');
    if (!posSecret && modeVal === 'local') {
      posSecret = 'local-poc-unsigned';
    }
    const resolved = window.QMS.Transport.resolveConfigForMode(m, params, base);
    const cfg = resolved || window.QMS.Transport.resolveFirebaseConfig(params, base);
    return Object.assign({}, cfg, { posSignSecret: posSecret });
  }

  function storeId() {
    return document.getElementById('fld-store').value.trim() || 's120030';
  }

  function publishLocalPocTargetFromForm() {
    const modeEl = document.getElementById('fld-mode');
    if (!modeEl || modeEl.value !== 'local') {
      return;
    }
    const Coord = window.QMS.Transport.LocalPocCoord;
    if (!Coord) {
      return;
    }
    const devEl = document.getElementById('fld-device');
    const deviceId = devEl && devEl.value.trim() ? devEl.value.trim() : 'stb-01';
    try {
      Coord.publishLocalPocTarget(window.localStorage, {
        storeId: storeId(),
        deviceId: deviceId,
        build: readLoadedBuildTag(),
      });
    } catch (e) {
      /* ignore */
    }
  }

  function readLoadedBuildTag() {
    const scripts = document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i += 1) {
      const src = scripts[i].src || '';
      const match = src.match(/controller-app\.js\?v=([^&]+)/);
      if (match) {
        return match[1];
      }
    }
    return '';
  }

  function hasRecentDeviceHeartbeat(storeIdValue, deviceIdValue) {
    try {
      const key = 'milksha:local:device:' + storeIdValue + ':' + deviceIdValue;
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        return false;
      }
      const data = JSON.parse(raw);
      if (!data || !data.online || !data.lastSeen) {
        return false;
      }
      return Date.now() - Date.parse(data.lastSeen) < heartbeatTimeoutMs();
    } catch (e) {
      return false;
    }
  }

  function refreshBoardLinkHint(mode) {
    boardLinkHint = '';
    if (mode !== 'local') {
      return;
    }
    const Coord = window.QMS.Transport.LocalPocCoord;
    if (!Coord) {
      return;
    }
    const deviceId = document.getElementById('fld-device').value.trim() || 'stb-01';
    if (hasRecentDeviceHeartbeat(storeId(), deviceId)) {
      return;
    }
    try {
      const foreign = Coord.findForeignRecentHeartbeat(
        window.localStorage,
        storeId(),
        heartbeatTimeoutMs(),
      );
      if (foreign) {
        boardLinkHint = '看板頁面是舊版或店號不同，請重新整理看板分頁';
      }
    } catch (e) {
      /* ignore */
    }
  }

  function pinLocalPocTargets() {
    const modeEl = document.getElementById('fld-mode');
    if (!modeEl || modeEl.value !== 'local') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const storeSel = document.getElementById('fld-store');
    if (storeSel && !params.get('store')) {
      storeSel.value = 's120030';
    }
    const devEl = document.getElementById('fld-device');
    if (devEl && !params.get('device')) {
      devEl.value = 'stb-01';
      try {
        localStorage.setItem('milksha:deviceId', 'stb-01');
      } catch (e) {
        /* ignore */
      }
    }
    publishLocalPocTargetFromForm();
  }

  function store() {
    return Validate.findStore(storeId());
  }

  function sourceDef(key) {
    for (let i = 0; i < SOURCE_OPTIONS.length; i += 1) {
      if (SOURCE_OPTIONS[i].key === key) return SOURCE_OPTIONS[i];
    }
    return SOURCE_OPTIONS[0];
  }

  function ticketsToNc(list) {
    const out = [];
    (list || tickets).forEach(function (t) {
      const def = sourceDef(t.sourceKey || 'store');
      const st = t.status === 'ready' ? def.ok : def.preparing;
      out.push({ source_type: st, number: t.no });
    });
    return out;
  }

  function wrapRequest(numberContent) {
    const s = store();
    return {
      isEncrypt: false,
      serviceSpecialData_Json: {
        target: Validate.milkshaTargetForAccount(s.account),
        data: { number_content: numberContent, newsTicker_content: [], newsTickerSpeed: 0 },
      },
      merchant_id: s.merchant_id,
      account: s.account,
    };
  }

  function formatPosUserMessage(res) {
    const info = res && res.information ? String(res.information) : '';
    if (info.indexOf('入口 A 未啟用') >= 0) {
      return '雲端的入口 A 沒開，請找後端開啟';
    }
    return info;
  }

  async function cloudCall(fn) {
    if (pauseCloud) {
      pushLog({ summary: '拔線測試：API 暫停', kind: 'network' });
      const err = new Error('cable_pull_pause');
      throw err;
    }
    return fn();
  }

  async function posSend(numberContent, wrongSign, wrongStore) {
    if (posInFlight) {
      showUserBanner('上一筆叫號仍在送出中');
      syncActionButtonStates();
      return { isSuccess: false, information: '上一筆叫號仍在送出中' };
    }
    posInFlight = true;
    setPosButtonsDisabled(true);
    const body = wrapRequest(numberContent);
    if (wrongStore) {
      body.serviceSpecialData_Json.target = 'wrong-target-000';
      body.account = 'wrong-store';
    }
    persistCloudForm();
    const mode = document.getElementById('fld-mode').value;
    const secret = buildConfig().posSignSecret;
    const signSecret = secret || (mode === 'local' ? 'local-poc-unsigned' : '');
    if (!signSecret) {
      showUserBanner('請在進階設定輸入測試環境專用 POS 金鑰');
      pushLog({ kind: 'posReceiver', summary: '叫號失敗 · 未設定 POS 金鑰' });
      posInFlight = false;
      setPosButtonsDisabled(false);
      return { isSuccess: false, information: '未設定 POS 金鑰' };
    }
    const signed = await PosSign.applyPosSignature(body, signSecret, wrongSign);
    const wire =
      signed && typeof signed.wireText === 'string'
        ? signed.wireText
        : signed && signed.__wireText
          ? signed.__wireText
          : signed;
    try {
      const res = await cloudCall(function () {
        return transport.cloudApi.posReceiver(wire);
      });
      window.__controllerTelemetry.lastPosResponse = res;
      if (typeof res.seq === 'number') {
        lastBoardSeq = res.seq;
        window.__controllerTelemetry.lastBoardSeq = lastBoardSeq;
      }
      const userMsg = formatPosUserMessage(res);
      pushLog({
        kind: 'posReceiver',
        summary:
          '叫號回應 isSuccess=' +
          res.isSuccess +
          ' · ' +
          (userMsg || res.information || '') +
          (res.seq ? ' seq=' + res.seq : ''),
        response: res,
      });
      if (res && res.isSuccess === false) {
        showUserBanner(userMsg || '叫號未成功，請查看原因');
      } else {
        showUserBanner('');
      }
      await refreshBoardLists();
      return res;
    } catch (e) {
      const info = e.response && e.response.information ? e.response.information : e.message;
      pushLog({ kind: 'posReceiver', summary: 'posReceiver 失敗 · ' + info, response: e.response });
      if (e && e.message === 'cable_pull_pause') {
        showUserBanner('拔線測試中，API 已暫停');
      } else {
        showUserBanner(info || '叫號送出失敗');
      }
      throw e;
    } finally {
      posInFlight = false;
      setPosButtonsDisabled(false);
    }
  }

  async function posSendRaw(body) {
    try {
      const res = await cloudCall(function () {
        return transport.cloudApi.posReceiver(body);
      });
      pushLog({ kind: 'posReceiver', summary: 'posReceiver raw · ' + (res.information || ''), response: res });
      return res;
    } catch (e) {
      const info = e.response && e.response.information ? e.response.information : e.message;
      pushLog({ kind: 'posReceiver', summary: 'posReceiver 失敗 · ' + info, response: e.response });
      throw e;
    }
  }

  async function mergeCloudLogs() {
    if (!transport || !transport.readReceiveLogs) return;
    try {
      const rcv = await transport.readReceiveLogs(40);
      const cmds = transport.readCommands ? await transport.readCommands(40) : [];
      rcv.forEach(function (row) {
        pushLog({ kind: 'cloud-receive', summary: '[cloud] ' + JSON.stringify(row.data), cloud: true });
      });
      cmds.forEach(function (row) {
        pushLog({ kind: 'cloud-command', summary: '[cloud] ' + JSON.stringify(row.data), cloud: true });
      });
      pushLog({ summary: '已合併雲端紀錄 receive=' + rcv.length + ' commands=' + cmds.length });
    } catch (e) {
      pushLog({ summary: '合併雲端紀錄失敗 ' + (e.message || '') });
    }
  }

  function renderTicketLists(board) {
    const prep = document.getElementById('list-prep');
    const ready = document.getElementById('list-ready');
    prep.innerHTML = '';
    ready.innerHTML = '';
    const list = board && board.tickets ? board.tickets : [];
    list.forEach(function (t) {
      const li = document.createElement('li');
      li.textContent = t.no + ' (' + t.status + ')';
      (t.status === 'ready' ? ready : prep).appendChild(li);
    });
  }

  async function refreshBoardLists() {
    if (!transport) return;
    const doc = await transport.readBoard();
    if (doc && doc.data) {
      tickets = (doc.data.tickets || []).map(function (t) {
        return {
          no: t.no,
          status: t.status,
          sourceKey: ticketSourceKey(t),
          source_type: t.source_type,
          updatedAt: t.updatedAt || new Date().toISOString(),
        };
      });
      lastBoardSeq = Number(doc.data.seq) || lastBoardSeq;
      window.__controllerTelemetry.lastBoardSeq = lastBoardSeq;
      renderTicketLists(doc.data);
      tickClock();
    }
  }

  async function pollDevice() {
    if (!transport || !connected) return;
    const deviceId = document.getElementById('fld-device').value.trim() || 'stb-01';
    try {
      const dev = await transport.readDevice(deviceId);
      const last = dev && dev.data ? dev.data.lastSeen : '';
      const onlineFlag = dev && dev.data ? dev.data.online : false;
      if (last) {
        lastHeartbeatAt = formatHeartbeatDisplay(last);
        const age = Date.now() - Date.parse(last);
        deviceOnline = onlineFlag && age < heartbeatTimeoutMs();
      } else {
        deviceOnline = false;
      }
      const mode = document.getElementById('fld-mode').value;
      refreshBoardLinkHint(mode);
      setConnectedState(true, mode);
      tickClock();
    } catch (e) {
      /* ignore */
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      publishLocalPocTargetFromForm();
      pollDevice();
      refreshBoardLists().catch(function () {});
    }, 4000);
  }

  let connectInFlight = false;
  let posInFlight = false;

  function setConnectButtonDisabled(disabled) {
    void disabled;
    syncActionButtonStates();
  }

  function setPosButtonsDisabled(disabled) {
    void disabled;
    syncActionButtonStates();
  }

  async function connect() {
    if (connectInFlight) {
      return;
    }
    connectInFlight = true;
    setConnectButtonDisabled(true);
    pinLocalPocTargets();
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (transport && transport.destroy) {
      transport.destroy();
    }
    transport = null;
    connected = false;
    setConnectedState(false, '');
    const mode = document.getElementById('fld-mode').value;
    if (mode === 'cloud' && !CloudSettings.isComplete(readCloudForm())) {
      showUserBanner('請先在進階設定填寫雲端設定與存取碼');
      syncCloudUi();
      connectInFlight = false;
      setConnectButtonDisabled(false);
      return;
    }
    const deviceId = document.getElementById('fld-device').value.trim() || 'stb-01';
    const accessCode = document.getElementById('fld-code').value.trim();
    const transportMode = mode === 'firestore' ? 'firestore' : mode;
    const config = buildConfig(mode);
    if ((mode === 'cloud' || mode === 'firestore') && !config.functionsBaseUrl) {
      showUserBanner('雲端連線設定不完整');
      connectInFlight = false;
      setConnectButtonDisabled(false);
      return;
    }
    transport = window.QMS.Transport.createTransport(transportMode, {
      storeId: storeId(),
      config: config,
      role: 'controller',
      deviceId: 'controller-web',
      accessCode: accessCode,
    });
    try {
      if (transport.session && transport.session.ensureIdToken) {
        await transport.session.ensureIdToken();
      }
      connected = true;
      await ensureLocalPocDeviceStub();
      await refreshBoardLists();
      await pollDevice();
      pushLog({ summary: '連線 ' + mode + ' store=' + storeId() + ' device=' + deviceId });
      startPolling();
      await mergeCloudLogs();
    } catch (e) {
      setConnectedState(false, '');
      presentConnectError(e);
      throw e;
    } finally {
      connectInFlight = false;
      setConnectButtonDisabled(false);
    }
  }

  async function sendCommand(type, params) {
    if (commandInFlight) {
      showUserBanner('指令送出中，請稍候');
      syncActionButtonStates();
      return;
    }
    const DevCmd = window.QMS.Transport.DevCommandValidation;
    const deviceId = document.getElementById('fld-device').value.trim() || 'stb-01';
    const built = DevCmd
      ? DevCmd.buildDevCommandRequest({
          storeId: storeId(),
          deviceId: deviceId,
          type: type,
          params: params || {},
        })
      : { ok: true, body: { storeId: storeId(), deviceId: deviceId, type: type, params: params || {} } };
    if (!built.ok) {
      presentDevCommandError(
        {
          status: 400,
          response: { code: built.code, message: built.message },
        },
        built.code,
      );
      return;
    }
    commandInFlight = true;
    setCommandButtonsDisabled(true);
    try {
      await cloudCall(function () {
        return transport.cloudApi.devCommand(built.body);
      });
      hideCommandErrorAlert();
      pushLog({ summary: '指令 ' + type, kind: 'command' });
    } catch (e) {
      presentDevCommandError(e);
    } finally {
      commandInFlight = false;
      setCommandButtonsDisabled(false);
    }
  }

  function addTicketLocal(status, sourceKey, no) {
    const ticket = {
      no: no || allocateOrderNumber(),
      status: status || document.getElementById('fld-status').value,
      sourceKey: sourceKey || document.getElementById('fld-source').value,
      updatedAt: new Date().toISOString(),
    };
    tickets.push(ticket);
    return ticket;
  }

  function generateTickets(kind) {
    tickets = [];
    const sources = SOURCE_OPTIONS.map(function (s) {
      return s.key;
    });
    if (kind === 'peak') {
      for (let i = 0; i < 18; i += 1) {
        tickets.push({
          no: String(3000 + i),
          status: i % 3 === 0 ? 'ready' : 'preparing',
          sourceKey: sources[i % sources.length],
          updatedAt: new Date().toISOString(),
        });
      }
    } else {
      tickets.push({ no: '1001', status: 'preparing', sourceKey: 'store', updatedAt: new Date().toISOString() });
      tickets.push({ no: '1002', status: 'ready', sourceKey: 'point', updatedAt: new Date().toISOString() });
      tickets.push({ no: '1003', status: 'preparing', sourceKey: 'uber', updatedAt: new Date().toISOString() });
    }
    document.getElementById('fld-no').value = kind === 'peak' ? '3018' : '1004';
  }

  function initStoreSelect() {
    const sel = document.getElementById('fld-store');
    Validate.STORES.forEach(function (s) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name + ' (' + s.id + ')';
      if (s.id === 's120030') {
        opt.selected = true;
      }
      sel.appendChild(opt);
    });
    const fromUrl = new URLSearchParams(window.location.search).get('store');
    if (fromUrl) sel.value = fromUrl;
  }

  function initSourceSelect() {
    const sel = document.getElementById('fld-source');
    SOURCE_OPTIONS.forEach(function (s) {
      const opt = document.createElement('option');
      opt.value = s.key;
      opt.textContent = s.label;
      sel.appendChild(opt);
    });
  }

  function initMobileZones() {
    function applyLayout() {
      document.querySelectorAll('.zone').forEach(function (z) {
        const body = z.querySelector('.zone-body');
        const btn = z.querySelector('.zone-toggle');
        if (!body) {
          return;
        }
        if (!btn) {
          body.hidden = false;
          return;
        }
        const def = z.getAttribute('data-default-expanded') === '1';
        const open = btn.getAttribute('aria-expanded') === 'true';
        if (btn.getAttribute('data-user-toggled') !== '1') {
          btn.setAttribute('aria-expanded', def ? 'true' : 'false');
          body.hidden = !def;
        } else {
          body.hidden = !open;
        }
      });
    }
    document.querySelectorAll('.zone-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', open ? 'false' : 'true');
        btn.setAttribute('data-user-toggled', '1');
        const body = btn.parentElement.querySelector('.zone-body');
        if (body) {
          body.hidden = open;
        }
      });
    });
    applyLayout();
  }

  function syncLocalModeNotice() {
    const el = document.getElementById('local-mode-notice');
    if (!el) return;
    el.hidden = document.getElementById('fld-mode').value !== 'local';
  }

  document.getElementById('fld-mode').addEventListener('change', function () {
    syncCloudUi();
    updateBoardLinks();
    syncActionButtonStates();
  });
  document.getElementById('fld-pos-sign-key').addEventListener('input', function () {
    if (ControllerSecrets) {
      ControllerSecrets.savePosSignSecret(document.getElementById('fld-pos-sign-key').value);
    }
  });
  ['fld-cloud-project', 'fld-cloud-apikey', 'fld-cloud-region', 'fld-code', 'fld-device'].forEach(
    function (id) {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', function () {
          syncCloudUi();
          updateBoardLinks();
        });
      }
    },
  );
  document.getElementById('btn-gen-board-link').addEventListener('click', function () {
    persistCloudForm();
    updateBoardLinks();
    showUserBanner('');
  });

  document.getElementById('btn-connect').addEventListener('click', function () {
    connect().catch(function (e) {
      setConnectedState(false, '');
      pushLog({ summary: '連線失敗 ' + e.message });
    });
  });

  document.getElementById('btn-add-ticket').addEventListener('click', function () {
    if (!requireConnect()) return;
    const no = allocateOrderNumber();
    document.getElementById('fld-no').value = no;
    addTicketLocal(undefined, undefined, no);
    posSend(ticketsToNc(), false)
      .then(function () {
        bumpNumberFieldAfterSend(no);
      })
      .catch(function () {});
  });

  document.getElementById('btn-one-ready').addEventListener('click', function () {
    if (!requireConnect()) return;
    let changed = false;
    for (let i = 0; i < tickets.length; i += 1) {
      if (tickets[i].status === 'preparing') {
        tickets[i].status = 'ready';
        tickets[i].updatedAt = new Date().toISOString();
        changed = true;
        break;
      }
    }
    if (!changed) {
      showUserBanner('沒有準備中的訂單');
      pushLog({ summary: '一鍵可取餐：沒有準備中的訂單' });
      return;
    }
    posSend(ticketsToNc(), false).catch(function (e) {
      showUserBanner((e && e.message) || '叫號送出失敗');
    });
  });

  document.getElementById('btn-pickup-scan').addEventListener('click', function () {
    if (!requireConnect()) return;
    const scan = document.getElementById('fld-pickup-scan').value.trim();
    if (!scan) {
      showUserBanner('請輸入或掃描取餐號碼');
      return;
    }
    tickets = tickets.filter(function (t) {
      return !(t.status === 'ready' && t.no === scan);
    });
    document.getElementById('fld-pickup-scan').value = '';
    posSend(ticketsToNc(), false).catch(function (e) {
      showUserBanner((e && e.message) || '叫號送出失敗');
    });
  });

  document.getElementById('btn-send-board').addEventListener('click', function () {
    if (!requireConnect()) return;
    posSend(ticketsToNc(), false).catch(function () {});
  });

  document.getElementById('btn-clear-board').addEventListener('click', function () {
    if (!requireConnect()) return;
    tickets = [];
    posSend([], false).catch(function () {});
  });

  document.getElementById('btn-bad-sign').addEventListener('click', function () {
    if (!requireConnect()) return;
    posSend(ticketsToNc(), true, false).catch(function () {});
  });

  document.getElementById('btn-bad-store').addEventListener('click', function () {
    if (!requireConnect()) return;
    posSend(ticketsToNc(), false, true).catch(function () {});
  });

  document.getElementById('btn-bad-format').addEventListener('click', function () {
    if (!requireConnect()) return;
    posSendRaw({ merchant_id: 'x' }).catch(function () {});
  });

  document.getElementById('btn-send-tammy').addEventListener('click', function () {
    if (!requireConnect()) return;
    try {
      const body = JSON.parse(document.getElementById('fld-tammy').value);
      const nc = body.serviceSpecialData_Json.data.number_content;
      tickets = TodayBoard.numberContentToTickets(nc).map(function (t) {
        return Object.assign({ sourceKey: ticketSourceKey(t) }, t);
      });
      posSend(nc, false).catch(function () {});
    } catch (e) {
      pushLog({ summary: 'Tammy JSON 解析失敗' });
    }
  });

  document.getElementById('btn-gen-normal').addEventListener('click', function () {
    if (!requireConnect()) return;
    generateTickets('normal');
    posSend(ticketsToNc(), false).catch(function () {});
  });

  function sendQuickDemoNumber() {
    if (!requireConnect()) {
      return;
    }
    const no = allocateOrderNumber();
    tickets.push({
      no: no,
      status: 'ready',
      sourceKey: 'store',
      updatedAt: new Date().toISOString(),
    });
    bumpNumberFieldAfterSend(no);
    posSend(ticketsToNc(), false).catch(function (e) {
      presentConnectError(e);
    });
  }

  document.getElementById('btn-send-numbers').addEventListener('click', function () {
    sendQuickDemoNumber();
  });

  document.getElementById('btn-gen-peak').addEventListener('click', function () {
    if (!requireConnect()) return;
    generateTickets('peak');
    posSend(ticketsToNc(), false).catch(function () {});
  });

  document.getElementById('btn-offline').addEventListener('click', function () {
    if (!requireConnect()) return;
    sendCommand('simulate_offline', {}).catch(function () {});
  });
  document.getElementById('btn-restore').addEventListener('click', function () {
    if (!requireConnect()) return;
    sendCommand('restore', {}).catch(function () {});
  });
  document.getElementById('btn-slow').addEventListener('click', function () {
    if (!requireConnect()) return;
    const delayEl = document.getElementById('fld-delay');
    const DevCmd = window.QMS.Transport.DevCommandValidation;
    const ms = DevCmd && DevCmd.clampTimingMs ? DevCmd.clampTimingMs(delayEl.value) : Number(delayEl.value) || 3000;
    delayEl.value = String(ms);
    sendCommand('slow', { delayMs: ms }).catch(function () {});
  });
  document.getElementById('btn-cable-pull').addEventListener('click', function () {
    if (!requireConnect()) return;
    pauseCloud = true;
    window.__controllerTelemetry.pauseCloud = true;
    pushLog({ summary: '拔線測試：已暫停 outbound API', kind: 'network' });
    showUserBanner('拔線測試中，API 已暫停');
    syncActionButtonStates();
  });
  document.getElementById('btn-cable-restore').addEventListener('click', function () {
    if (!requireConnect()) return;
    pauseCloud = false;
    window.__controllerTelemetry.pauseCloud = false;
    pushLog({ summary: '拔線測試：已恢復 API', kind: 'network' });
    showUserBanner('');
    syncActionButtonStates();
  });

  document.getElementById('btn-clear-now').addEventListener('click', function () {
    if (!requireConnect()) return;
    sendCommand('clear_now', {})
      .then(function () {
        tickets = [];
        showUserBanner('看板已清空');
        pushLog({ summary: '清空看板 · clear_now', kind: 'command' });
        return refreshBoardLists();
      })
      .catch(function (e) {
        showUserBanner((e && e.message) || '清空看板失敗');
      });
  });
  document.getElementById('btn-reload').addEventListener('click', function () {
    if (!requireConnect()) return;
    sendCommand('reload', {}).catch(function () {});
  });
  document.getElementById('btn-reboot').addEventListener('click', function () {
    if (!requireConnect()) return;
    sendCommand('reboot', {}).catch(function () {});
  });

  document.getElementById('btn-dup-list').addEventListener('click', function () {
    if (!requireConnect()) return;
    const nc = ticketsToNc();
    posSend(nc, false)
      .then(function () {
        return posSend(nc, false);
      })
      .catch(function () {});
    pushLog({ summary: '重送同一份名單（兩次）' });
  });

  document.getElementById('btn-late-old').addEventListener('click', function () {
    if (!requireConnect()) return;
    if (!transport || !transport.debugSetBoard) {
      pushLog({ summary: '此模式無 debugSetBoard' });
      return;
    }
    const staleSeq = Math.max(1, lastBoardSeq - 5);
    const board = TodayBoard.buildTodayBoard(storeId(), staleSeq, tickets, 'stale-test');
    transport.debugSetBoard(board);
    pushLog({ summary: '注入過舊 board seq=' + staleSeq });
  });

  document.getElementById('btn-refresh-logs').addEventListener('click', function () {
    if (!requireConnect()) return;
    mergeCloudLogs().catch(function () {});
  });

  document.getElementById('btn-export-json').addEventListener('click', function () {
    const blob = new Blob([JSON.stringify(logEntries, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'controller-logs.json';
    a.click();
  });

  document.getElementById('btn-export-csv').addEventListener('click', function () {
    const rows = ['at,kind,summary'];
    logEntries.forEach(function (e) {
      const line =
        '"' +
        (e.at || '').replace(/"/g, '""') +
        '","' +
        (e.kind || '').replace(/"/g, '""') +
        '","' +
        (e.summary || '').replace(/"/g, '""') +
        '"';
      rows.push(line);
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'controller-logs.csv';
    a.click();
  });

  document.getElementById('btn-clear-log').addEventListener('click', function () {
    logEntries = [];
    localStorage.removeItem(LOG_KEY);
    renderLogs();
  });

  document.getElementById('log-filter').addEventListener('input', function (ev) {
    logFilter = ev.target.value;
    renderLogs();
  });

  const commandErrorClose = document.getElementById('command-error-close');
  if (commandErrorClose) {
    commandErrorClose.addEventListener('click', hideCommandErrorAlert);
  }

  fillCloudForm(CloudSettings.load());
  const params = new URLSearchParams(window.location.search);
  const modeParam = params.get('mode');
  if (modeParam === 'firestore') {
    document.getElementById('fld-mode').value = 'firestore';
    document.getElementById('fld-use-emulator').checked = true;
  } else if (modeParam === 'cloud') {
    document.getElementById('fld-mode').value = 'cloud';
  } else if (!modeParam || modeParam === 'local') {
    document.getElementById('fld-mode').value = 'local';
  }
  if (params.get('gateway')) {
    document.getElementById('fld-gateway').value = params.get('gateway');
  }
  document.getElementById('fld-tammy').value = JSON.stringify(Validate.TAMMY_SAMPLE_REQUEST, null, 2);

  initStoreSelect();
  initSourceSelect();
  initActionBlockReasons();
  initMobileZones();
  syncCloudUi();
  updateBoardLinks();
  loadLogs();
  clockTimer = setInterval(tickClock, 1000);
  tickClock();

  syncActionButtonStates();

  window.__controller = {
    getTickets: function () {
      return tickets.slice();
    },
    getTransport: function () {
      return transport;
    },
    setDevCommandHandler: function (fn) {
      if (!transport || !transport.cloudApi) {
        return false;
      }
      transport.cloudApi.devCommand = fn;
      return true;
    },
  };

  if (document.getElementById('fld-mode').value === 'local') {
    pinLocalPocTargets();
    connect().catch(function (e) {
      setConnectedState(false, '');
      pushLog({ summary: '自動連線失敗 ' + (e && e.message ? e.message : String(e)) });
    });
  }
})();
