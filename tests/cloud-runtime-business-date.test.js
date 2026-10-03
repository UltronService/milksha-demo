'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadCloudRuntimeHarness(nowIso) {
  const storage = {};
  const RealDate = Date;
  const fixedMs = nowIso ? RealDate.parse(nowIso) : RealDate.now();
  function MockDate(...args) {
    if (args.length === 0) {
      return new RealDate(fixedMs);
    }
    return new RealDate(...args);
  }
  MockDate.now = function () {
    return fixedMs;
  };
  MockDate.parse = RealDate.parse;
  MockDate.UTC = RealDate.UTC;

  const sandbox = {
    globalThis: {},
    window: {},
    document: {
      getElementById: function () {
        return null;
      },
    },
    localStorage: {
      getItem: function (k) {
        return storage[k] ?? null;
      },
      setItem: function (k, v) {
        storage[k] = String(v);
      },
      removeItem: function (k) {
        delete storage[k];
      },
    },
    Set: Set,
    Date: MockDate,
    Intl: Intl,
    Promise: Promise,
    setInterval: function () {
      return 1;
    },
    clearInterval: function () {},
    setTimeout: function (fn) {
      fn();
      return 1;
    },
    clearTimeout: function () {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const files = [
    'js/board/today-board.js',
    'js/transport/board-seq.js',
    'js/receiver/validate-request.js',
    'js/receiver/chime-policy.js',
    'js/receiver/cloud-runtime.js',
  ];
  for (let i = 0; i < files.length; i += 1) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, files[i]), 'utf8'), sandbox);
  }
  return { sandbox: sandbox, storage: storage };
}

test('cloud runtime ignores board without businessDate and keeps cache', async function () {
  const { sandbox, storage } = loadCloudRuntimeHarness('2026-10-03T12:00:00.000Z');
  const cacheKey = 'milksha:receiver-cache:s120030';
  const cachePayload = {
    seq: 3,
    numberContent: [{ source_type: 'From_Store_OK', number: '77' }],
    businessDate: '2026-10-03',
    boardUpdatedAt: '2026-10-03T06:00:00.000Z',
  };
  storage[cacheKey] = JSON.stringify(cachePayload);
  let pushCalls = 0;
  const demo = {
    pushFromObject: function () {
      pushCalls += 1;
      return { isOK: true };
    },
  };
  const transport = {
    session: {
      ensureIdToken: async function () {},
    },
    readBoard: async function () {
      return {
        data: {
          storeId: 's120030',
          businessDate: '',
          seq: 4,
          updatedAt: '2026-10-03T00:00:00.000Z',
          source: 'A',
          tickets: [{ no: '88', status: 'ready', updatedAt: '2026-10-03T00:00:00.000Z' }],
        },
        updateTime: '2026-10-03T00:00:00.000Z',
        httpDate: '',
        httpDateReadable: false,
      };
    },
    readDevice: async function () {
      return null;
    },
  };
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: 's120030',
    deviceId: 'stb-01',
    transport: transport,
    receiverDemo: demo,
  });
  cloud.start();
  await new Promise(function (r) {
    setTimeout(r, 20);
  });
  assert.equal(pushCalls, 1);
  assert.equal(storage[cacheKey], JSON.stringify(cachePayload));
  assert.equal(sandbox.QMS.Board.TodayBoard.getSessionBusinessDate(), '2026-10-03');
});

test('offline reboot shows boot cache silently when clock matches today', async function () {
  const now = '2026-10-03T14:00:00.000Z';
  const { sandbox, storage } = loadCloudRuntimeHarness(now);
  const TB = sandbox.QMS.Board.TodayBoard;
  const cacheKey = 'milksha:receiver-cache:s120030';
  const bd = TB.taipeiBusinessDate(new Date(now));
  const cachePayload = {
    seq: 5,
    numberContent: [{ source_type: 'From_Store_OK', number: '42' }],
    businessDate: bd,
    boardUpdatedAt: '2026-10-03T08:00:00.000Z',
  };
  storage[cacheKey] = JSON.stringify(cachePayload);
  const ringIds = [];
  const pushedNumbers = [];
  const demo = {
    pushFromObject: function (req, opts) {
      const nc = req && req.serviceSpecialData_Json && req.serviceSpecialData_Json.data
        ? req.serviceSpecialData_Json.data.number_content
        : [];
      for (let i = 0; i < nc.length; i += 1) {
        pushedNumbers.push(nc[i].number);
      }
      if (opts && opts.newlyReadyIds) {
        ringIds.push(opts.newlyReadyIds.slice());
      }
      return { isOK: true };
    },
  };
  const transport = {
    session: { ensureIdToken: async function () {} },
    readBoard: async function () {
      throw new Error('offline');
    },
    readDevice: async function () {
      return null;
    },
  };
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: 's120030',
    deviceId: 'stb-01',
    transport: transport,
    receiverDemo: demo,
  });
  cloud.start();
  await new Promise(function (r) {
    setTimeout(r, 20);
  });
  assert.equal(ringIds.flat().length, 0);
  assert.equal(sandbox.QMS.Board.TodayBoard.getSessionBusinessDate(), bd);
  assert.deepEqual(pushedNumbers, ['42']);
  assert.equal(storage[cacheKey], JSON.stringify(cachePayload));
});

test('offline reboot with clock 1970 does not show boot cache', async function () {
  const { sandbox, storage } = loadCloudRuntimeHarness('1970-01-01T00:00:00.000Z');
  const cacheKey = 'milksha:receiver-cache:s120030';
  const cachePayload = {
    seq: 1,
    numberContent: [{ source_type: 'From_Store_OK', number: '11' }],
    businessDate: '2026-10-03',
    boardUpdatedAt: '2026-10-03T08:00:00.000Z',
  };
  storage[cacheKey] = JSON.stringify(cachePayload);
  let pushCalls = 0;
  const demo = {
    pushFromObject: function () {
      pushCalls += 1;
      return { isOK: true };
    },
  };
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: 's120030',
    deviceId: 'stb-01',
    transport: {
      session: { ensureIdToken: async function () {} },
      readBoard: async function () {
        throw new Error('offline');
      },
      readDevice: async function () {
        return null;
      },
    },
    receiverDemo: demo,
  });
  cloud.start();
  await new Promise(function (r) {
    setTimeout(r, 10);
  });
  assert.equal(pushCalls, 0);
  assert.equal(sandbox.QMS.Board.TodayBoard.hasSessionBusinessDate(), false);
  assert.equal(storage[cacheKey], JSON.stringify(cachePayload));
});

test('offline reboot skips empty boot cache and leaves board pre-data', async function () {
  const now = '2026-10-03T14:00:00.000Z';
  const { sandbox, storage } = loadCloudRuntimeHarness(now);
  const TB = sandbox.QMS.Board.TodayBoard;
  const cacheKey = 'milksha:receiver-cache:s120030';
  const bd = TB.taipeiBusinessDate(new Date(now));
  const cachePayload = {
    seq: 2,
    numberContent: [],
    businessDate: bd,
    boardUpdatedAt: '2026-10-03T08:00:00.000Z',
  };
  storage[cacheKey] = JSON.stringify(cachePayload);
  let pushCalls = 0;
  const demo = {
    pushFromObject: function () {
      pushCalls += 1;
      return { isOK: true };
    },
  };
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: 's120030',
    deviceId: 'stb-01',
    transport: {
      session: { ensureIdToken: async function () {} },
      readBoard: async function () {
        throw new Error('offline');
      },
      readDevice: async function () {
        return null;
      },
    },
    receiverDemo: demo,
  });
  cloud.start();
  await new Promise(function (r) {
    setTimeout(r, 10);
  });
  assert.equal(pushCalls, 0);
  assert.equal(sandbox.QMS.Board.TodayBoard.hasSessionBusinessDate(), false);
  assert.equal(storage[cacheKey], JSON.stringify(cachePayload));
});

test('cloud seq lower than cached boot seq still applies when localSeq stays 0', async function () {
  const now = '2026-10-03T14:00:00.000Z';
  const { sandbox, storage } = loadCloudRuntimeHarness(now);
  const TB = sandbox.QMS.Board.TodayBoard;
  const cacheKey = 'milksha:receiver-cache:s120030';
  const bd = TB.taipeiBusinessDate(new Date(now));
  storage[cacheKey] = JSON.stringify({
    seq: 5,
    numberContent: [{ source_type: 'From_Store_OK', number: '11' }],
    businessDate: bd,
    boardUpdatedAt: '2026-10-03T08:00:00.000Z',
  });
  const ringIds = [];
  const cloudNumbers = [];
  const demo = {
    pushFromObject: function (req, opts) {
      const nc = req && req.serviceSpecialData_Json && req.serviceSpecialData_Json.data
        ? req.serviceSpecialData_Json.data.number_content
        : [];
      for (let i = 0; i < nc.length; i += 1) {
        cloudNumbers.push(nc[i].number);
      }
      if (opts && opts.newlyReadyIds) {
        ringIds.push(opts.newlyReadyIds.slice());
      }
      return { isOK: true };
    },
  };
  const transport = {
    session: { ensureIdToken: async function () {} },
    readBoard: async function () {
      return {
        data: {
          storeId: 's120030',
          businessDate: bd,
          seq: 1,
          updatedAt: '2026-10-03T15:00:00.000Z',
          source: 'A',
          tickets: [{ no: '77', status: 'ready', updatedAt: '2026-10-03T15:00:00.000Z' }],
        },
        updateTime: '2026-10-03T15:00:00.000Z',
        httpDate: '',
        httpDateReadable: false,
      };
    },
    readDevice: async function () {
      return null;
    },
  };
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: 's120030',
    deviceId: 'stb-01',
    transport: transport,
    receiverDemo: demo,
  });
  cloud.start();
  await new Promise(function (r) {
    setTimeout(r, 30);
  });
  assert.equal(ringIds.flat().length, 0);
  assert.ok(cloudNumbers.includes('77'));
  const saved = JSON.parse(storage[cacheKey]);
  assert.equal(saved.seq, 1);
});

test('cloud replaces boot cache silently on first fetch', async function () {
  const now = '2026-10-03T14:00:00.000Z';
  const { sandbox, storage } = loadCloudRuntimeHarness(now);
  const TB = sandbox.QMS.Board.TodayBoard;
  const cacheKey = 'milksha:receiver-cache:s120030';
  const bd = TB.taipeiBusinessDate(new Date(now));
  storage[cacheKey] = JSON.stringify({
    seq: 1,
    numberContent: [{ source_type: 'From_Store_OK', number: '11' }],
    businessDate: bd,
    boardUpdatedAt: '2026-10-03T08:00:00.000Z',
  });
  const ringIds = [];
  let readCount = 0;
  const demo = {
    pushFromObject: function (_req, opts) {
      if (opts && opts.newlyReadyIds) {
        ringIds.push(opts.newlyReadyIds.slice());
      }
      return { isOK: true };
    },
  };
  const transport = {
    session: { ensureIdToken: async function () {} },
    readBoard: async function () {
      readCount += 1;
      return {
        data: {
          storeId: 's120030',
          businessDate: bd,
          seq: 2,
          updatedAt: '2026-10-03T15:00:00.000Z',
          source: 'A',
          tickets: [{ no: '99', status: 'ready', updatedAt: '2026-10-03T15:00:00.000Z' }],
        },
        updateTime: '2026-10-03T15:00:00.000Z',
        httpDate: '',
        httpDateReadable: false,
      };
    },
    readDevice: async function () {
      return null;
    },
  };
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: 's120030',
    deviceId: 'stb-01',
    transport: transport,
    receiverDemo: demo,
  });
  cloud.start();
  await new Promise(function (r) {
    setTimeout(r, 30);
  });
  assert.ok(readCount >= 1);
  assert.equal(ringIds.flat().length, 0);
  const saved = JSON.parse(storage[cacheKey]);
  assert.equal(saved.seq, 2);
  assert.equal(saved.boardUpdatedAt, '2026-10-03T15:00:00.000Z');
});

test('cloud runtime applies board when HTTP Date is readable', async function () {
  const { sandbox } = loadCloudRuntimeHarness('2026-10-03T12:00:00.000Z');
  let pushCalls = 0;
  const demo = {
    pushFromObject: function () {
      pushCalls += 1;
      return { isOK: true };
    },
  };
  const transport = {
    session: {
      ensureIdToken: async function () {},
    },
    readBoard: async function () {
      return {
        data: {
          storeId: 's120030',
          businessDate: '',
          seq: 2,
          updatedAt: '2026-10-03T00:00:00.000Z',
          source: 'A',
          tickets: [{ no: '55', status: 'ready', updatedAt: '2026-10-03T00:00:00.000Z' }],
        },
        updateTime: '2026-10-03T00:00:00.000Z',
        httpDate: 'Fri, 03 Oct 2026 10:00:00 GMT',
        httpDateReadable: true,
      };
    },
    readDevice: async function () {
      return null;
    },
  };
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: 's120030',
    deviceId: 'stb-01',
    transport: transport,
    receiverDemo: demo,
  });
  cloud.start();
  await new Promise(function (r) {
    setTimeout(r, 20);
  });
  assert.equal(pushCalls, 1);
  assert.equal(sandbox.QMS.Board.TodayBoard.getSessionBusinessDate(), '2026-10-03');
});

test('first cloud batch after boot stays silent when stale cache cleared on roll', async function () {
  const { sandbox, storage } = loadCloudRuntimeHarness('2026-10-03T12:00:00.000Z');
  const cacheKey = 'milksha:receiver-cache:s120030';
  storage[cacheKey] = JSON.stringify({
    seq: 1,
    numberContent: [{ source_type: 'From_Store_OK', number: '11' }],
    businessDate: '2026-10-01',
    boardUpdatedAt: '2026-10-01T08:00:00.000Z',
  });
  const ringIds = [];
  const demo = {
    pushFromObject: function (_req, opts) {
      if (opts && opts.newlyReadyIds) {
        ringIds.push(opts.newlyReadyIds.slice());
      }
      return { isOK: true };
    },
  };
  const transport = {
    session: { ensureIdToken: async function () {} },
    readBoard: async function () {
      return {
        data: {
          storeId: 's120030',
          businessDate: '2026-10-03',
          seq: 2,
          updatedAt: '2026-10-03T00:00:00.000Z',
          source: 'A',
          tickets: [{ no: '22', status: 'ready', updatedAt: '2026-10-03T00:00:00.000Z' }],
        },
        updateTime: '2026-10-03T00:00:00.000Z',
        httpDate: '',
        httpDateReadable: false,
      };
    },
    readDevice: async function () {
      return null;
    },
  };
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: 's120030',
    deviceId: 'stb-01',
    transport: transport,
    receiverDemo: demo,
  });
  cloud.start();
  await new Promise(function (r) {
    setTimeout(r, 30);
  });
  assert.equal(ringIds.flat().length, 0);
});

test('guest clock hidden on boot with no cache', async function () {
  const { sandbox } = loadCloudRuntimeHarness('2026-10-03T14:00:00.000Z');
  const clockStates = [];
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: 's120030',
    deviceId: 'stb-01',
    transport: {
      session: { ensureIdToken: async function () {} },
      readBoard: async function () {
        throw new Error('offline');
      },
      readDevice: async function () {
        return null;
      },
    },
    receiverDemo: {
      pushFromObject: function () {
        return { isOK: true };
      },
      setGuestClockState: function (opts) {
        clockStates.push(opts);
      },
    },
  });
  cloud.start();
  await new Promise(function (r) {
    setTimeout(r, 15);
  });
  assert.ok(clockStates.some(function (s) {
    return s.hidden === true && s.clearCloudAnchor === true;
  }));
});

test('guest clock hidden on boot when shouldShowBootCache rejects 1970 clock', async function () {
  const { sandbox, storage } = loadCloudRuntimeHarness('1970-01-01T00:00:00.000Z');
  const cacheKey = 'milksha:receiver-cache:s120030';
  storage[cacheKey] = JSON.stringify({
    seq: 2,
    numberContent: [{ source_type: 'From_Store_OK', number: '55' }],
    businessDate: '2026-10-03',
    boardUpdatedAt: '2026-10-03T08:00:00.000Z',
  });
  const clockStates = [];
  const demo = {
    pushFromObject: function () {
      return { isOK: true };
    },
    setGuestClockState: function (opts) {
      clockStates.push(opts);
    },
  };
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: 's120030',
    deviceId: 'stb-01',
    transport: {
      session: { ensureIdToken: async function () {} },
      readBoard: async function () {
        throw new Error('offline');
      },
      readDevice: async function () {
        return null;
      },
    },
    receiverDemo: demo,
  });
  cloud.start();
  await new Promise(function (r) {
    setTimeout(r, 15);
  });
  assert.ok(clockStates.some(function (s) {
    return s.hidden === true;
  }));
});

test('guest clock shown after cloud board when box clock is 1970', async function () {
  const { sandbox, storage } = loadCloudRuntimeHarness('1970-01-01T00:00:00.000Z');
  const cacheKey = 'milksha:receiver-cache:s120030';
  storage[cacheKey] = JSON.stringify({
    seq: 1,
    numberContent: [{ source_type: 'From_Store_OK', number: '11' }],
    businessDate: '2026-10-03',
    boardUpdatedAt: '2026-10-03T08:00:00.000Z',
  });
  const clockStates = [];
  const demo = {
    pushFromObject: function () {
      return { isOK: true };
    },
    setGuestClockState: function (opts) {
      clockStates.push(opts);
    },
  };
  const transport = {
    session: { ensureIdToken: async function () {} },
    readBoard: async function () {
      return {
        data: {
          storeId: 's120030',
          businessDate: '2026-10-03',
          seq: 2,
          updatedAt: '2026-10-03T15:00:00.000Z',
          source: 'A',
          tickets: [{ no: '88', status: 'ready', updatedAt: '2026-10-03T15:00:00.000Z' }],
        },
        updateTime: '2026-10-03T15:00:00.000Z',
        httpDate: 'Fri, 03 Oct 2026 14:00:00 GMT',
        httpDateReadable: true,
      };
    },
    readDevice: async function () {
      return null;
    },
  };
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: 's120030',
    deviceId: 'stb-01',
    transport: transport,
    receiverDemo: demo,
  });
  cloud.start();
  await new Promise(function (r) {
    setTimeout(r, 40);
  });
  assert.ok(
    clockStates.some(function (s) {
      return s.hidden === true;
    }),
  );
  assert.ok(
    clockStates.some(function (s) {
      return s.hidden === false && typeof s.timeMs === 'number';
    }),
  );
});

test('missing board with readable HTTP Date reveals guest clock', async function () {
  const { sandbox, storage } = loadCloudRuntimeHarness('1970-01-01T00:00:00.000Z');
  const cacheKey = 'milksha:receiver-cache:s120030';
  storage[cacheKey] = JSON.stringify({
    seq: 1,
    numberContent: [{ source_type: 'From_Store_OK', number: '11' }],
    businessDate: '2026-10-03',
    boardUpdatedAt: '2026-10-03T08:00:00.000Z',
  });
  const clockStates = [];
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: 's120030',
    deviceId: 'stb-01',
    transport: {
      session: { ensureIdToken: async function () {} },
      readBoard: async function () {
        return {
          missing: true,
          httpDate: 'Fri, 03 Oct 2026 14:00:00 GMT',
          httpDateReadable: true,
        };
      },
      readDevice: async function () {
        return null;
      },
    },
    receiverDemo: {
      pushFromObject: function () {
        return { isOK: true };
      },
      setGuestClockState: function (opts) {
        clockStates.push(opts);
      },
    },
  });
  cloud.start();
  await new Promise(function (r) {
    setTimeout(r, 40);
  });
  assert.ok(
    clockStates.some(function (s) {
      return s.hidden === false && typeof s.timeMs === 'number';
    }),
  );
});

test('missing board without HTTP Date keeps clock hidden after failed boot check', async function () {
  const { sandbox } = loadCloudRuntimeHarness('1970-01-01T00:00:00.000Z');
  const clockStates = [];
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: 's120030',
    deviceId: 'stb-01',
    transport: {
      session: { ensureIdToken: async function () {} },
      readBoard: async function () {
        return { missing: true, httpDate: '', httpDateReadable: false };
      },
      readDevice: async function () {
        return null;
      },
    },
    receiverDemo: {
      pushFromObject: function () {
        return { isOK: true };
      },
      setGuestClockState: function (opts) {
        clockStates.push(opts);
      },
    },
  });
  cloud.start();
  await new Promise(function (r) {
    setTimeout(r, 40);
  });
  const last = clockStates[clockStates.length - 1];
  assert.equal(last.hidden, true);
});
