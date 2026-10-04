'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('board bootstrap does not read access code from query string', function () {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'receiver', 'cloud-boot.js'), 'utf8');
  assert.doesNotMatch(src, /params\.get\(['"]code['"]\)/);
});

test('home board index wires cloud sync scripts', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /js\/receiver\/cloud-boot\.js/);
  assert.match(html, /js\/receiver\/cloud-runtime\.js/);
  assert.match(html, /js\/transport\/local-cloud-shim\.js/);
});

test('setup link documents cfg hash only in docs', function () {
  const emulator = fs.readFileSync(path.join(ROOT, 'docs', 'EMULATOR.md'), 'utf8');
  const owner = fs.readFileSync(path.join(ROOT, 'docs', 'OWNER-TRIAL.md'), 'utf8');
  assert.match(emulator, /#cfg=/);
  assert.match(emulator, /\?code=/);
  assert.doesNotMatch(owner, /產生看板連結/);
  assert.doesNotMatch(owner, /#cfg=/);
  assert.match(owner, /Android 工程師/);
});
