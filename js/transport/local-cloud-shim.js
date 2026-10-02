/**
 * Local mode: emulate cloud functions + Firestore docs in localStorage.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  const TodayBoard = QMS.Board.TodayBoard;
  const PosSign = QMS.Transport.MilkshaPosSign;
  const Paths = QMS.Transport.Paths;

  function boardKey(storeId) {
    return 'milksha:local:board:' + storeId;
  }

  function deviceKey(storeId, deviceId) {
    return 'milksha:local:device:' + storeId + ':' + deviceId;
  }

  function receiveLogsKey(storeId) {
    return 'milksha:local:receive_logs:' + storeId;
  }

  function commandsLogsKey(storeId) {
    return 'milksha:local:commands:' + storeId;
  }

  function readJson(storage, key) {
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeJson(storage, key, val) {
    storage.setItem(key, JSON.stringify(val));
  }

  /**
   * @param {object} options
   */
  function createLocalCloudShim(options) {
    const storeId = options.storeId;
    const boundTarget = options.boundTarget || '';
    const storage = options.storage || root.localStorage;
    const config = options.config || {};
    const channel = options.broadcast || function () {};

    function nextSeq() {
      const cur = readJson(storage, boardKey(storeId));
      return (cur && cur.seq ? Number(cur.seq) : 0) + 1;
    }

    function appendReceiveLog(entry) {
      const key = receiveLogsKey(storeId);
      const list = readJson(storage, key) || [];
      list.unshift(Object.assign({ at: new Date().toISOString() }, entry));
      writeJson(storage, key, list.slice(0, 200));
    }

    function appendCommandLog(entry) {
      const key = commandsLogsKey(storeId);
      const list = readJson(storage, key) || [];
      list.unshift(Object.assign({ at: new Date().toISOString() }, entry));
      writeJson(storage, key, list.slice(0, 200));
    }

    function storeHasOnlineBox() {
      const prefix = 'milksha:local:device:' + storeId + ':';
      const now = Date.now();
      for (let i = 0; i < storage.length; i += 1) {
        const k = storage.key(i);
        if (!k || k.indexOf(prefix) !== 0) continue;
        const data = readJson(storage, k);
        if (data && data.online && data.lastSeen) {
          if (now - Date.parse(data.lastSeen) < 120000) return true;
        }
      }
      return false;
    }

    const sessionStub = {
      authHeaders: async function () {
        return { Authorization: 'Bearer local-dev-token' };
      },
    };

    const api = {
      boxHeartbeat: async function (body) {
        const devId = body.deviceId || 'stb-01';
        const doc = readJson(storage, deviceKey(storeId, devId)) || {};
        const merged = Object.assign(doc, {
          lastSeen: new Date().toISOString(),
          online: !body.simulatedOffline,
          appVersion: body.appVersion || '',
          boardSeq: body.boardSeq || 0,
          pendingUploads: body.pendingUploads || 0,
          simulatedOffline: Boolean(body.simulatedOffline),
          lastAckCommandId: body.ackCommandId || doc.lastAckCommandId || '',
          pendingCommand: doc.pendingCommand || null,
        });
        writeJson(storage, deviceKey(storeId, devId), merged);
        channel({ type: 'device', storeId: storeId, deviceId: devId });
        return { ok: true };
      },
      devCommand: async function (body) {
        const devId = body.deviceId || 'stb-01';
        const doc = readJson(storage, deviceKey(storeId, devId)) || {};
        const cmd = {
          id: 'cmd-' + Date.now(),
          type: body.type,
          params: body.params || {},
          issuedAt: new Date().toISOString(),
        };
        if (body.type === 'clear_now') {
          const board = TodayBoard.buildTodayBoard(storeId, nextSeq(), [], 'system');
          writeJson(storage, boardKey(storeId), board);
          channel({ type: 'board', storeId: storeId });
        }
        doc.pendingCommand = cmd;
        writeJson(storage, deviceKey(storeId, devId), doc);
        channel({ type: 'command', storeId: storeId, deviceId: devId });
        appendCommandLog({ kind: 'devCommand', body: body, command: cmd });
        return { ok: true, commandId: cmd.id };
      },
      posReceiver: async function (body) {
        if (!body || !body.serviceSpecialData_Json) {
          appendReceiveLog({ kind: 'posReceiver', isSuccess: false, information: '叫號資料格式錯誤' });
          const err = new Error('format');
          err.response = { isSuccess: false, information: '叫號資料格式錯誤' };
          throw err;
        }
        const secret = config.posSignSecret || 'dev-milksha-public-test-key-2026';
        const valid = await PosSign.verifyPosBody(body, secret);
        if (!valid) {
          appendReceiveLog({ kind: 'posReceiver', isSuccess: false, information: '簽章錯誤' });
          const err = new Error('invalid signature');
          err.response = { isSuccess: false, information: '簽章錯誤' };
          throw err;
        }
        const target = body.serviceSpecialData_Json.target || '';
        if (boundTarget && target && target !== boundTarget) {
          appendReceiveLog({ kind: 'posReceiver', isSuccess: false, information: '找不到目標叫號機' });
          const err = new Error('wrong store');
          err.response = { isSuccess: false, information: '找不到目標叫號機' };
          throw err;
        }
        const nc = body.serviceSpecialData_Json.data && body.serviceSpecialData_Json.data.number_content;
        const tickets = TodayBoard.numberContentToTickets(nc || []);
        const board = TodayBoard.buildTodayBoard(storeId, nextSeq(), tickets, 'A');
        writeJson(storage, boardKey(storeId), board);
        channel({ type: 'board', storeId: storeId });
        const online = storeHasOnlineBox();
        const information = online ? '資料顯示成功' : '目標叫號機尚未連線';
        appendReceiveLog({
          kind: 'posReceiver',
          isSuccess: online,
          information: information,
          seq: board.seq,
        });
        return { isSuccess: online, information: information, seq: board.seq };
      },
    };

    async function devLogin(body) {
      return {
        customToken: 'local-custom-' + (body.storeId || storeId) + '-' + (body.role || 'device'),
      };
    }

    async function signInWithCustomToken() {
      return {
        idToken: 'local-id-token',
        refreshToken: 'local-refresh',
        expiresIn: '3600',
      };
    }

    function readBoard() {
      const data = readJson(storage, boardKey(storeId));
      if (!data) {
        return null;
      }
      return { data: data, updateTime: data.updatedAt || '' };
    }

    function readDevice(deviceId) {
      const data = readJson(storage, deviceKey(storeId, deviceId));
      if (!data) {
        return null;
      }
      return { data: data, updateTime: data.lastSeen || '' };
    }

    function listDevices() {
      const prefix = 'milksha:local:device:' + storeId + ':';
      const out = [];
      for (let i = 0; i < storage.length; i += 1) {
        const k = storage.key(i);
        if (k && k.indexOf(prefix) === 0) {
          const id = k.slice(prefix.length);
          const data = readJson(storage, k);
          if (data) {
            out.push({ id: id, data: data, updateTime: data.lastSeen || '' });
          }
        }
      }
      return out;
    }

    function readReceiveLogs() {
      return (readJson(storage, receiveLogsKey(storeId)) || []).map(function (entry, idx) {
        return { id: 'rcv-' + idx, data: entry, updateTime: entry.at || '' };
      });
    }

    function readCommands() {
      return (readJson(storage, commandsLogsKey(storeId)) || []).map(function (entry, idx) {
        return { id: 'cmd-' + idx, data: entry, updateTime: entry.at || '' };
      });
    }

    function debugSetBoard(board) {
      writeJson(storage, boardKey(storeId), board);
      channel({ type: 'board', storeId: storeId });
      return { ok: true };
    }

    return {
      api: api,
      sessionStub: sessionStub,
      devLogin: devLogin,
      signInWithCustomToken: signInWithCustomToken,
      readBoard: readBoard,
      readDevice: readDevice,
      listDevices: listDevices,
      readReceiveLogs: readReceiveLogs,
      readCommands: readCommands,
      debugSetBoard: debugSetBoard,
      paths: Paths,
    };
  }

  QMS.Transport.createLocalCloudShim = createLocalCloudShim;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
