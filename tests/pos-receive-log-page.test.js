'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'tools', 'pos-receive-log', 'index.html');
const APP = path.join(ROOT, 'tools', 'pos-receive-log', 'pos-receive-log-app.js');

test('pos-receive-log page delay column header is 比收件晚（秒）', function () {
  const html = fs.readFileSync(PAGE, 'utf8');
  assert.match(html, /比收件晚（秒）/);
});

test('pos-receive-log app wires format helpers for 完整 IP and delay seconds', function () {
  const appSrc = fs.readFileSync(APP, 'utf8');
  const html = fs.readFileSync(PAGE, 'utf8');
  assert.match(appSrc, /formatIpForDisplay/);
  assert.match(appSrc, /formatReceiveDelayCell/);
  assert.match(html, /pos-receive-log-format\.js/);
});
