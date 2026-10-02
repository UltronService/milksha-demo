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
  let pauseCloud = false;
  let pollTimer = null;
  let clockTimer = null;

  const LOG_KEY = 'milksha:controller:logs';

  window.__controllerTelemetry = {
    connected: false,
    lastBoardSeq: 0,
    pauseCloud: false,
    lastPosResponse: null,
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

  function modeDisplayName(mode) {
    return mode === 'firestore' ? '雲端連線測試' : '本機連動';
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
      el.textContent =
        '已連線（' +
        modeDisplayName(mode) +
        '）· 看板 ' +
        (deviceOnline ? '在線' : '離線/未知') +
        (lastHeartbeatAt ? ' · 最後心跳 ' + lastHeartbeatAt : '');
      showUserBanner('');
    } else {
      el.textContent = '尚未連線';
    }
    window.__controllerTelemetry.connected = isOn;
  }

  function heartbeatTimeoutMs() {
    const sec = Number(document.getElementById('fld-heartbeat-timeout').value) || 120;
    return Math.max(5, sec) * 1000;
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

  function buildConfig() {
    const params = new URLSearchParams(window.location.search);
    const gateway = document.getElementById('fld-gateway').value.trim();
    const key = document.getElementById('fld-key').value.trim();
    if (gateway) params.set('gateway', gateway);
    if (key) params.set('key', key);
    return window.QMS.Transport.resolveFirebaseConfig(params, window.MILKSHA_FIREBASE_CONFIG);
  }

  function storeId() {
    return document.getElementById('fld-store').value.trim() || 's120030';
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
        target: s.target,
        data: { number_content: numberContent, newsTicker_content: [], newsTickerSpeed: 0 },
      },
      merchant_id: s.merchant_id,
      account: s.account,
      timeStmp: '2026-10-02-12-00-00:0000',
      serviceSpecialData_Json_Md5Hash: 'demo',
      signature: 'pending',
    };
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
    const body = wrapRequest(numberContent);
    if (wrongStore) {
      body.serviceSpecialData_Json.target = 'wrong-target-000';
      body.account = 'wrong-store';
    }
    const secret = buildConfig().posSignSecret;
    const signed = await PosSign.applyPosSignature(body, secret, wrongSign);
    try {
      const res = await cloudCall(function () {
        return transport.cloudApi.posReceiver(signed);
      });
      window.__controllerTelemetry.lastPosResponse = res;
      if (typeof res.seq === 'number') {
        lastBoardSeq = res.seq;
        window.__controllerTelemetry.lastBoardSeq = lastBoardSeq;
      }
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
      setConnectedState(true, mode);
      tickClock();
    } catch (e) {
      /* ignore */
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      pollDevice();
      refreshBoardLists().catch(function () {});
    }, 4000);
  }

  async function connect() {
    const mode = document.getElementById('fld-mode').value;
    const deviceId = document.getElementById('fld-device').value.trim() || 'stb-01';
    const accessCode = document.getElementById('fld-code').value.trim();
    const config = buildConfig();
    transport = window.QMS.Transport.createTransport(mode, {
      storeId: storeId(),
      config: config,
      role: 'controller',
      deviceId: 'controller-web',
      accessCode: accessCode,
    });
    if (transport.session && transport.session.ensureIdToken) {
      await transport.session.ensureIdToken();
    }
    setConnectedState(true, mode);
    pushLog({ summary: '連線 ' + mode + ' store=' + storeId() + ' device=' + deviceId });
    await refreshBoardLists();
    await pollDevice();
    startPolling();
    await mergeCloudLogs();
  }

  async function sendCommand(type, params) {
    await cloudCall(function () {
      return transport.cloudApi.devCommand({
        storeId: storeId(),
        deviceId: document.getElementById('fld-device').value.trim() || 'stb-01',
        type: type,
        params: params || {},
      });
    });
    pushLog({ summary: '指令 ' + type, kind: 'command' });
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
    const narrow = window.matchMedia('(max-width: 480px)');
    function applyLayout() {
      document.querySelectorAll('.zone').forEach(function (z) {
        const body = z.querySelector('.zone-body');
        const btn = z.querySelector('.zone-toggle');
        if (!body || !btn) return;
        if (narrow.matches) {
          const def = z.getAttribute('data-default-expanded') === '1';
          const open = btn.getAttribute('aria-expanded') === 'true';
          if (btn.getAttribute('data-user-toggled') !== '1') {
            btn.setAttribute('aria-expanded', def ? 'true' : 'false');
            body.hidden = !def;
          } else {
            body.hidden = !open;
          }
        } else {
          body.hidden = false;
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    }
    document.querySelectorAll('.zone-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!narrow.matches) return;
        const open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', open ? 'false' : 'true');
        btn.setAttribute('data-user-toggled', '1');
        const body = btn.parentElement.querySelector('.zone-body');
        if (body) body.hidden = open;
      });
    });
    narrow.addEventListener('change', applyLayout);
    applyLayout();
  }

  function syncLocalModeNotice() {
    const el = document.getElementById('local-mode-notice');
    if (!el) return;
    el.hidden = document.getElementById('fld-mode').value !== 'local';
  }

  document.getElementById('fld-mode').addEventListener('change', syncLocalModeNotice);

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
    for (let i = 0; i < tickets.length; i += 1) {
      if (tickets[i].status === 'preparing') {
        tickets[i].status = 'ready';
        tickets[i].updatedAt = new Date().toISOString();
        break;
      }
    }
    posSend(ticketsToNc(), false).catch(function () {});
  });

  document.getElementById('btn-pickup-scan').addEventListener('click', function () {
    if (!requireConnect()) return;
    const scan = document.getElementById('fld-pickup-scan').value.trim();
    if (!scan) return;
    tickets = tickets.filter(function (t) {
      return !(t.status === 'ready' && t.no === scan);
    });
    document.getElementById('fld-pickup-scan').value = '';
    posSend(ticketsToNc(), false).catch(function () {});
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
    const ms = Number(document.getElementById('fld-delay').value) || 3000;
    sendCommand('slow', { delayMs: ms }).catch(function () {});
  });
  document.getElementById('btn-cable-pull').addEventListener('click', function () {
    if (!requireConnect()) return;
    pauseCloud = true;
    window.__controllerTelemetry.pauseCloud = true;
    pushLog({ summary: '拔線測試：已暫停 outbound API', kind: 'network' });
  });
  document.getElementById('btn-cable-restore').addEventListener('click', function () {
    if (!requireConnect()) return;
    pauseCloud = false;
    window.__controllerTelemetry.pauseCloud = false;
    pushLog({ summary: '拔線測試：已恢復 API', kind: 'network' });
  });

  document.getElementById('btn-clear-now').addEventListener('click', function () {
    if (!requireConnect()) return;
    sendCommand('clear_now', {})
      .then(function () {
        tickets = [];
        return refreshBoardLists();
      })
      .catch(function () {});
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

  const defaultCode =
    (window.MILKSHA_FIREBASE_CONFIG && window.MILKSHA_FIREBASE_CONFIG.defaultControllerAccessCode) ||
    'dev-controller-access-2026';
  document.getElementById('fld-code').value = defaultCode;
  const params = new URLSearchParams(window.location.search);
  const modeParam = params.get('mode');
  if (modeParam === 'firestore') {
    document.getElementById('fld-mode').value = 'firestore';
  } else if (!modeParam || modeParam === 'local') {
    document.getElementById('fld-mode').value = 'local';
  }
  document.getElementById('fld-tammy').value = JSON.stringify(Validate.TAMMY_SAMPLE_REQUEST, null, 2);

  initStoreSelect();
  initSourceSelect();
  initMobileZones();
  syncLocalModeNotice();
  loadLogs();
  clockTimer = setInterval(tickClock, 1000);
  tickClock();

  window.__controller = {
    getTickets: function () {
      return tickets.slice();
    },
    getTransport: function () {
      return transport;
    },
  };
})();
