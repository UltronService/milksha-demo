'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadBoardSeq() {
  const sandbox = { Set: Set, Object: Object, Array: Array };
  sandbox.QMS = {};
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js', 'transport', 'board-seq.js'), 'utf8'),
    sandbox,
  );
  return sandbox.QMS.Transport.BoardSeq;
}

test('seq only moves forward', function () {
  const BS = loadBoardSeq();
  assert.equal(BS.shouldAcceptBoard(5, 4), true);
  assert.equal(BS.shouldAcceptBoard(4, 5), false);
  assert.equal(BS.shouldAcceptBoard(5, 5), false);
});

test('newlyReadyIds detects new ready tickets', function () {
  const BS = loadBoardSeq();
  const prev = new Set(['store:1']);
  const next = new Set(['store:1', 'store:2']);
  const ids = BS.newlyReadyIds(prev, next);
  assert.equal(ids.length, 1);
  assert.equal(ids[0], 'store:2');
});
