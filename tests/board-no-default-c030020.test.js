'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const BOARD_RUNTIME_FILES = [
  'js/receiver/cloud-boot.js',
  'js/transport/local-poc-coord.js',
  'js/app.js',
  'js/receiver/home-board-store.js',
  'index.html',
];

test('item 13: board boot runtime has no default c030020 fallback', function () {
  for (const rel of BOARD_RUNTIME_FILES) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.doesNotMatch(src, /return\s+'c030020'/, rel);
    assert.doesNotMatch(src, /DEFAULT_STORE_ID\s*=\s*'c030020'/, rel);
    assert.doesNotMatch(src, /defaultHomeBoardStoreId/, rel);
  }
});

test('item 14: setup screen uses system font stack in CSS', function () {
  const css = fs.readFileSync(path.join(ROOT, 'css', 'milksha-board.css'), 'utf8');
  assert.match(css, /\.board-store-setup/);
  assert.match(css, /font-family:[^;]*system-ui/);
});

test('item 14: index exposes setup gate with setup message', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /board-store-setup/);
  assert.match(html, /請設定店編號/);
  assert.match(html, /js\/store-id\.js/);
  assert.match(html, /js\/receiver\/home-board-store\.js/);
});
