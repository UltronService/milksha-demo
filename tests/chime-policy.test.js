'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadChimePolicy() {
  const sandbox = { Set: Set };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js/receiver/chime-policy.js'), 'utf8'),
    sandbox,
  );
  return sandbox.QMS.Receiver.createBoardChimePolicy;
}

function assertRingEqual(actual, expected) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
}

function newlyReadyIds(prev, next) {
  const out = [];
  next.forEach(function (id) {
    if (!prev.has(id)) {
      out.push(id);
    }
  });
  return out;
}

test('first batch after load is silent', function () {
  const create = loadChimePolicy();
  let bd = '2026-10-02';
  const policy = create({
    getBusinessDate: function () {
      return bd;
    },
    newlyReadyIds: newlyReadyIds,
  });
  let prev = new Set();
  let next = new Set(['store:1001']);
  assertRingEqual(policy.pickRingIds(prev, next), []);
  prev = next;
  next = new Set(['store:1001', 'store:1002']);
  assertRingEqual(policy.pickRingIds(prev, next), ['store:1002']);
});

test('ready preparing ready again does not re-chime same business day', function () {
  const create = loadChimePolicy();
  const policy = create({
    getBusinessDate: function () {
      return '2026-10-02';
    },
    newlyReadyIds: newlyReadyIds,
  });
  let prev = new Set();
  let next = new Set(['store:55']);
  assertRingEqual(policy.pickRingIds(prev, next), []);
  prev = next;
  next = new Set(['store:55', 'store:56']);
  assertRingEqual(policy.pickRingIds(prev, next), ['store:56']);
  prev = next;
  next = new Set(['store:55']);
  assertRingEqual(policy.pickRingIds(prev, next), []);
  prev = next;
  next = new Set(['store:55', 'store:56']);
  assertRingEqual(policy.pickRingIds(prev, next), []);
});

test('silent and suppressRing skip chime', function () {
  const create = loadChimePolicy();
  const policy = create({
    getBusinessDate: function () {
      return '2026-10-02';
    },
    newlyReadyIds: newlyReadyIds,
  });
  policy.pickRingIds(new Set(), new Set(['store:1']));
  assertRingEqual(policy.pickRingIds(new Set(['store:1']), new Set(['store:1', 'store:2']), { silent: true }), []);
  assertRingEqual(
    policy.pickRingIds(new Set(['store:1']), new Set(['store:1', 'store:3']), { suppressRing: true }),
    [],
  );
});

test('stale cache clear preserves first-batch silent flag', function () {
  const create = loadChimePolicy();
  const policy = create({
    getBusinessDate: function () {
      return '2026-10-02';
    },
    newlyReadyIds: newlyReadyIds,
  });
  policy.pickRingIds(new Set(), new Set(['store:1']), { preserveFirstBatchFlag: true });
  assertRingEqual(policy.pickRingIds(new Set(), new Set(['store:1', 'store:2'])), []);
  assertRingEqual(
    policy.pickRingIds(new Set(['store:1', 'store:2']), new Set(['store:1', 'store:2', 'store:3'])),
    ['store:3'],
  );
});

test('same number different source rings once per business day', function () {
  const create = loadChimePolicy();
  const policy = create({
    getBusinessDate: function () {
      return '2026-10-02';
    },
    newlyReadyIds: newlyReadyIds,
  });
  policy.pickRingIds(new Set(), new Set(['store:77']));
  let prev = new Set(['store:77']);
  let next = new Set(['store:77', 'point:77']);
  assertRingEqual(policy.pickRingIds(prev, next), []);
});

test('after 03:00 business-day roll chimed set clears and ready can chime again', function () {
  const create = loadChimePolicy();
  let bd = '2026-10-02';
  const policy = create({
    getBusinessDate: function () {
      return bd;
    },
    newlyReadyIds: newlyReadyIds,
  });
  policy.pickRingIds(new Set(), new Set(['store:9']));
  policy.pickRingIds(new Set(['store:9']), new Set(['store:9', 'store:10']));
  policy.pickRingIds(new Set(['store:9', 'store:10']), new Set(['store:9']));
  policy.pickRingIds(new Set(['store:9']), new Set(['store:9', 'store:10']));
  bd = '2026-10-03';
  policy.onBusinessDateRoll();
  assertRingEqual(policy.pickRingIds(new Set(['store:9']), new Set(['store:9', 'store:10'])), ['store:10']);
});
