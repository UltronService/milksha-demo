'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('mutation guard: ingest skips tickets without firstIntakeLogId', function () {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'board', 'box-seen-report.js'), 'utf8');
  assert.match(src, /firstIntakeLogId/);
  assert.match(src, /if\s*\(\s*!intakeLogId\s*\)\s*\{\s*continue;\s*\}/);
});
