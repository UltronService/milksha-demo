(function () {
  'use strict';

  const Validate = window.QMS.Receiver.Validate;
  const TodayBoard = window.QMS.Board.TodayBoard;
  const PosSign = window.QMS.Transport.MilkshaPosSign;

  let transport = null;
  let tickets = [];
  let logEntries = [];
  const LOG_KEY = 'milksha:controller:logs';

  function loadLogs() {
    try {
      logEntries = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    } catch (e) {
      logEntries = [];
    }
    renderLogs();
  }

  function pushLog(entry) {
    logEntries.unshift(
      Object.assign({ at: new Date().toISOString() }, entry),
    );
    logEntries = logEntries.slice(0, 300);
    localStorage.setItem(LOG_KEY, JSON.stringify(logEntries));
    renderLogs();
  }

  function renderLogs() {
    const ul = document.getElementById('log-list');
    ul.innerHTML = '';
    logEntries.slice(0, 50).forEach(function (e) {
      const li = document.createElement('li');
      li.textContent = (e.at || '') + ' · ' + (e.summary || JSON.stringify(e));
      ul.appendChild(li);
    });
  }

  function buildConfig() {
    const params = new URLSearchParams(window.location.search);
    const gateway = document.getElementById('fld-gateway').value.trim();
    const key = document.getElementById('fld-key').value.trim();
    if (gateway) params.set('gateway', gateway);
    if (key) params.set('key', key);
    return window.QMS.Transport.resolveFirebaseConfig(
      params,
      window.MILKSHA_FIREBASE_CONFIG,
    );
  }

  async function connect() {
    const storeId = document.getElementById('fld-store').value.trim() || 's120030';
    const mode = document.getElementById('fld-mode').value;
    const deviceId = document.getElementById('fld-device').value.trim() || 'stb-01';
    const accessCode = document.getElementById('fld-code').value.trim();
    const config = buildConfig();
    transport = window.QMS.Transport.createTransport(mode, {
      storeId: storeId,
      config: config,
      role: 'controller',
      deviceId: 'controller-web',
      accessCode: accessCode,
    });
    if (transport.session && transport.session.ensureIdToken) {
      await transport.session.ensureIdToken();
    }
    document.getElementById('online-state').textContent = '已連線（' + mode + '）';
    pushLog({ summary: '連線 ' + mode + ' store=' + storeId });
    refreshBoardLists();
    pollDevice();
  }

  function store() {
    return Validate.findStore(document.getElementById('fld-store').value.trim() || 's120030');
  }

  function wrapRequest(numberContent) {
    const s = store();
    return {
      isEncrypt: false,
      serviceSpecialData_Json: {
        target: s.target,
        data: { number_content: numberContent, newsTicker_content: [], newsTickerSpeed: 0 },
      },
      merchant_id: s.merchant_id,
      account: document.getElementById('fld-store').value.trim() || s.account,
      timeStmp: '2026-10-02-12-00-00:0000',
      serviceSpecialData_Json_Md5Hash: 'demo',
      signature: 'pending',
    };
  }

  async function posSend(numberContent, wrongSign, wrongStore) {
    const body = wrapRequest(numberContent);
    if (wrongStore) {
      body.serviceSpecialData_Json.target = 'wrong-target-000';
      body.account = 'wrong-store';
    }
    const secret = buildConfig().posSignSecret;
    const signed = await PosSign.applyPosSignature(body, secret, wrongSign);
    try {
      const res = await transport.cloudApi.posReceiver(signed);
      pushLog({
        kind: 'posReceiver',
        summary:
          'posReceiver isSuccess=' +
          res.isSuccess +
          ' · ' +
          (res.information || '') +
          (res.seq ? ' seq=' + res.seq : ''),
        payload: signed,
        response: res,
      });
      await refreshBoardLists();
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
      const rcv = await transport.readReceiveLogs(30);
      const cmds = transport.readCommands ? await transport.readCommands(30) : [];
      rcv.forEach(function (row) {
        pushLog({ kind: 'cloud-receive', summary: JSON.stringify(row.data), cloud: true });
      });
      cmds.forEach(function (row) {
        pushLog({ kind: 'cloud-command', summary: JSON.stringify(row.data), cloud: true });
      });
    } catch (e) {
      /* ignore */
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
      tickets = doc.data.tickets || [];
      renderTicketLists(doc.data);
    }
  }

  async function pollDevice() {
    if (!transport) return;
    const deviceId = document.getElementById('fld-device').value.trim() || 'stb-01';
    const storeId = document.getElementById('fld-store').value.trim() || 's120030';
    try {
      const dev = await transport.readDevice(deviceId);
      const last = dev && dev.data ? dev.data.lastSeen : '';
      const online = dev && dev.data ? dev.data.online : false;
      document.getElementById('online-state').textContent =
        (online ? '機上盒在線' : '離線/未知') + (last ? ' · 最後 ' + last : '');
    } catch (e) {
      /* ignore */
    }
    setTimeout(pollDevice, 5000);
  }

  async function sendCommand(type, params) {
    const storeId = document.getElementById('fld-store').value.trim() || 's120030';
    const deviceId = document.getElementById('fld-device').value.trim() || 'stb-01';
    await transport.cloudApi.devCommand({ storeId: storeId, deviceId: deviceId, type: type, params: params || {} });
    pushLog({ summary: '指令 ' + type });
  }

  document.getElementById('btn-connect').addEventListener('click', function () {
    connect().catch(function (e) {
      pushLog({ summary: '連線失敗 ' + e.message });
    });
  });

  document.getElementById('btn-add-ticket').addEventListener('click', function () {
    const no = document.getElementById('fld-no').value.trim();
    const status = document.getElementById('fld-status').value;
    tickets.push({ no: no, status: status, updatedAt: new Date().toISOString() });
    const nc = TodayBoard.ticketsToNumberContent(tickets);
    posSend(nc, false);
  });

  document.getElementById('btn-send-board').addEventListener('click', function () {
    posSend(TodayBoard.ticketsToNumberContent(tickets), false);
  });

  document.getElementById('btn-clear-board').addEventListener('click', function () {
    tickets = [];
    posSend([], false);
  });

  document.getElementById('btn-bad-sign').addEventListener('click', function () {
    posSend(TodayBoard.ticketsToNumberContent(tickets), true);
  });

  document.getElementById('btn-send-tammy').addEventListener('click', function () {
    try {
      const body = JSON.parse(document.getElementById('fld-tammy').value);
      const nc = body.serviceSpecialData_Json.data.number_content;
      posSend(nc, false);
    } catch (e) {
      pushLog({ summary: 'Tammy JSON 解析失敗' });
    }
  });

  document.getElementById('btn-offline').addEventListener('click', function () {
    sendCommand('simulate_offline', {});
  });
  document.getElementById('btn-restore').addEventListener('click', function () {
    sendCommand('restore', {});
  });
  document.getElementById('btn-slow').addEventListener('click', function () {
    const ms = Number(document.getElementById('fld-delay').value) || 3000;
    sendCommand('slow', { delayMs: ms });
  });
  document.getElementById('btn-clear-now').addEventListener('click', function () {
    sendCommand('clear_now', {});
    tickets = [];
    refreshBoardLists();
  });
  document.getElementById('btn-reload').addEventListener('click', function () {
    sendCommand('reload', {});
  });
  document.getElementById('btn-reboot').addEventListener('click', function () {
    sendCommand('reboot', {});
  });

  document.getElementById('btn-export-json').addEventListener('click', function () {
    const blob = new Blob([JSON.stringify(logEntries, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'controller-logs.json';
    a.click();
  });
  document.getElementById('btn-clear-log').addEventListener('click', function () {
    logEntries = [];
    localStorage.removeItem(LOG_KEY);
    renderLogs();
  });

  const defaultCode =
    (window.MILKSHA_FIREBASE_CONFIG && window.MILKSHA_FIREBASE_CONFIG.defaultControllerAccessCode) ||
    'dev-controller-access-2026';
  document.getElementById('fld-code').value = defaultCode;
  const modeParam = new URLSearchParams(window.location.search).get('mode');
  if (!modeParam || modeParam === 'local') {
    document.getElementById('fld-mode').value = 'local';
  }
  document.getElementById('fld-tammy').value = JSON.stringify(Validate.TAMMY_SAMPLE_REQUEST, null, 2);
  loadLogs();
})();
