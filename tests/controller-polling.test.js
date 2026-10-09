'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('controller uses 4s pollDevice only (no fast board-online probe)', function () {
  const src = fs.readFileSync(path.join(ROOT, 'controller', 'controller-app.js'), 'utf8');
  assert.equal(src.includes('startBoardOnlineFastProbe'), false);
  assert.equal(src.includes('boardOnlineFastProbeTimer'), false);
  assert.match(src, /setInterval\(function \(\) \{[\s\S]*pollDevice\(\);[\s\S]*\}, 4000\)/);
});
