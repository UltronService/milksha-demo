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
    const PosValidate = QMS.Transport.PosReceiverValidate;
    const Md5 = QMS.Transport.MilkshaMd5;
    const DevCmd = QMS.Transport.DevCommandValidation;
    let entryAEnabled = options.posReceiverEntryAEnabled !== false;

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
        const hv = DevCmd ? DevCmd.buildBoxHeartbeatRequest(body) : { ok: true, body: body };
        if (!hv.ok) {
          const err = new Error('boxHeartbeat');
          err.status = 400;
          err.response = { code: hv.code, message: hv.message };
          throw err;
        }
        const hb = hv.body;
        const devId = hb.deviceId;
        const doc = readJson(storage, deviceKey(storeId, devId)) || {};
        const merged = Object.assign(doc, {
          lastSeen: new Date().toISOString(),
          online: !hb.simulatedOffline,
          appVersion: hb.appVersion || '',
          boardSeq: hb.boardSeq || 0,
          pendingUploads: hb.pendingUploads || 0,
          simulatedOffline: Boolean(hb.simulatedOffline),
          lastAckCommandId: hb.ackCommandId || doc.lastAckCommandId || '',
          pendingCommand: doc.pendingCommand || null,
        });
        writeJson(storage, deviceKey(storeId, devId), merged);
        channel({ type: 'device', storeId: storeId, deviceId: devId });
        return { ok: true };
      },
      devCommand: async function (body) {
        const cv = DevCmd ? DevCmd.buildDevCommandRequest(body) : { ok: true, body: body };
        if (!cv.ok) {
          const err = new Error('devCommand');
          err.status = 400;
          err.response = { code: cv.code, message: cv.message };
          throw err;
        }
        const cmdBody = cv.body;
        const devId = cmdBody.deviceId;
        const existing = readJson(storage, deviceKey(storeId, devId));
        if (!existing) {
          const err = new Error('devCommand');
          err.status = 404;
          err.response = { code: 'device_not_found', message: 'device not found' };
          throw err;
        }
        const doc = existing;
        const cmd = {
          id: 'cmd-' + Date.now(),
          type: cmdBody.type,
          params: cmdBody.params || {},
          issuedAt: new Date().toISOString(),
        };
        if (cmdBody.type === 'clear_now') {
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
        const reject = function (information) {
          appendReceiveLog({ kind: 'posReceiver', isSuccess: false, information: information });
          return { isSuccess: false, information: information };
        };
        let parsed = body;
        let rawInner = null;
        const JsonRaw = QMS.Transport.JsonRaw;
        if (typeof body === 'string') {
          if (JsonRaw) {
            rawInner = JsonRaw.extractRawJsonField(body, 'serviceSpecialData_Json');
          }
          try {
            parsed = JSON.parse(body);
          } catch (e) {
            return reject('叫號資料格式錯誤');
          }
        }
        if (PosValidate && Md5) {
          const innerRaw =
            rawInner !== null && rawInner !== undefined
              ? rawInner
              : JSON.stringify(parsed.serviceSpecialData_Json);
          const v = PosValidate.validatePosReceiverBody(parsed, {
            entryAEnabled: entryAEnabled,
            md5Hex: Md5.md5Hex,
            serviceSpecialDataJsonRaw: innerRaw,
          });
          if (!v.ok) {
            return reject(v.information);
          }
        } else if (!parsed || !parsed.serviceSpecialData_Json) {
          return reject('叫號資料格式錯誤');
        }
        const reqTarget = parsed.serviceSpecialData_Json.target;
        if (boundTarget && typeof reqTarget === 'string' && reqTarget !== boundTarget) {
          return reject('找不到目標叫號機');
        }
        const secret = config.posSignSecret || '';
        if (secret) {
          const valid = await PosSign.verifyPosBody(parsed, secret);
          if (!valid) {
            return reject('簽章錯誤');
          }
        }
        const online = storeHasOnlineBox();
        const information = online ? '資料顯示成功' : '目標叫號機尚未連線';
        let seq = null;
        if (online) {
          const nc = parsed.serviceSpecialData_Json.data && parsed.serviceSpecialData_Json.data.number_content;
          const tickets = TodayBoard.numberContentToTickets(nc || []);
          seq = nextSeq();
          const board = TodayBoard.buildTodayBoard(storeId, seq, tickets, 'A');
          writeJson(storage, boardKey(storeId), board);
          channel({ type: 'board', storeId: storeId });
        }
        appendReceiveLog({
          kind: 'posReceiver',
          isSuccess: online,
          information: information,
          seq: seq,
        });
        return { isSuccess: online, information: information, seq: seq };
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
      return {
        data: data,
        updateTime: data.updatedAt || '',
        httpDate: '',
        httpDateReadable: false,
      };
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
