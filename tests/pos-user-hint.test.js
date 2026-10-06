'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

test('pos information 找不到機台 maps to open-board hint in controller', function () {
  const src = fs.readFileSync(path.join(ROOT, 'controller', 'controller-app.js'), 'utf8');
  const fnMatch = src.match(/function formatPosUserMessage\(res\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(fnMatch, 'formatPosUserMessage exists');
  const sandbox = { document: { getElementById: () => null } };
  vm.runInNewContext(fnMatch[0] + '\nthis.formatPosUserMessage = formatPosUserMessage;', sandbox);
  const hint = sandbox.formatPosUserMessage({ isSuccess: false, information: '找不到機台' });
  assert.equal(hint, '請先打開看板');
});
