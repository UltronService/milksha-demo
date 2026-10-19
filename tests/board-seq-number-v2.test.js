'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadBoardSeqStack() {
  const sandbox = {
    Set: Set,
    Object: Object,
    Array: Array,
    String: String,
    Intl: Intl,
  };
  sandbox.QMS = {};
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/pos-ticket-display-no.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/milksha-board.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/board-seq.js'), 'utf8'), sandbox);
  return {
    BS: sandbox.QMS.Transport.BoardSeq,
    MB: sandbox.QMS.MilkshaBoard,
  };
}

test('readyIdSetFromContent dedupes ready ids on trimmed original not display slice', function () {
  const { BS, MB } = loadBoardSeqStack();
  const set = BS.readyIdSetFromContent(
    [
      { source_type: 'From_Store_OK', number: ' 130 ' },
      { source_type: 'From_Store_OK', number: '130' },
    ],
    MB.parseSourceType,
    MB.makeItemId,
  );
  assert.equal(set.size, 1);
  assert.equal(set.has('store:130'), true);
});

test('readyIdSetFromContent removal diff matches padded original not six-char display', function () {
  const { BS, MB } = loadBoardSeqStack();
  const long = '#130,vke3-2643-dy6y';
  const prev = BS.readyIdSetFromContent(
    [{ source_type: 'From_FoodPanda_OK', number: long }],
    MB.parseSourceType,
    MB.makeItemId,
  );
  const next = BS.readyIdSetFromContent([], MB.parseSourceType, MB.makeItemId);
  assert.equal(prev.size, 1);
  assert.equal(prev.has('fp:#130,vke3-2643-dy6y'), true);
  assert.equal(prev.has('fp:#130,v'), false);
  assert.equal(next.size, 0);
  const dropped = [];
  prev.forEach(function (id) {
    if (!next.has(id)) {
      dropped.push(id);
    }
  });
  assert.deepEqual(dropped, ['fp:#130,vke3-2643-dy6y']);
});
