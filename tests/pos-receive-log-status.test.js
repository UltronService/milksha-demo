'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadLogApp() {
  const sandbox = { globalThis: {}, Date: Date };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js', 'tools', 'pos-receive-log-format.js'), 'utf8'),
    sandbox,
  );
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'tools', 'pos-receive-log', 'pos-receive-log-app.js'), 'utf8'),
    sandbox,
  );
  return sandbox.QMS.Tools.PosReceiveLogApp;
}

test('log page item 23: not_reported shows 未回報 never em dash', function () {
  const App = loadLogApp();
  const row = App.mapBoxReportRow({ boxId: 'b1', status: 'not_reported', clockSynced: true });
  assert.equal(row.statusText, '未回報');
  assert.doesNotMatch(row.statusText, /—/);
  assert.notEqual(row.statusText, '—');
});

test('log page item 24: clockSynced false shows 未校正 never em dash', function () {
  const App = loadLogApp();
  const row = App.mapBoxReportRow({ boxId: 'b1', status: 'reported', clockSynced: false });
  assert.equal(row.clockText, '未校正');
  assert.doesNotMatch(row.clockText, /—/);
  const missing = App.mapBoxReportRow({ boxId: 'b1', status: 'reported' });
  assert.equal(missing.clockText, '未校正');
});
