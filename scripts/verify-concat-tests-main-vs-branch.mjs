#!/usr/bin/env node
/**
 * Prove board-cell-integrity tests fail on main anim.js and pass on fix branch.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const animPath = join(root, 'js/board/milksha-board-anim.js');
const backupPath = join(root, 'artifacts/board-concat-bug/milksha-board-anim.fix.js');
const logPath = join(root, 'artifacts/board-concat-bug/test-main-vs-branch.log');

function run(cmd, args) {
  return spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
}

const lines = [];
function log(s) {
  lines.push(s);
  console.log(s);
}

copyFileSync(animPath, backupPath);
const mainAnim = spawnSync('git', ['show', 'origin/main:js/board/milksha-board-anim.js'], { cwd: root, encoding: 'utf8' });
if (mainAnim.status !== 0) {
  console.error(mainAnim.stderr);
  process.exit(1);
}

log('=== board-cell-integrity.test.js on MAIN milksha-board-anim.js ===');
writeFileSync(animPath, mainAnim.stdout);
let r = run(process.execPath, ['--test', 'tests/board-cell-integrity.test.js']);
log(r.stdout || '');
log(r.stderr || '');
log(`exit: ${r.status}`);
const mainUnitFail = r.status !== 0;

log('\n=== board-cell-single-number (prep slot swap) on MAIN anim ===');
r = run('npx', ['playwright', 'test', 'tests/e2e/board-cell-single-number.spec.mjs', '-g', 'prep slot swap', '--reporter=line']);
log(r.stdout || '');
log(r.stderr || '');
log(`exit: ${r.status}`);
const mainE2eFail = r.status !== 0;

copyFileSync(backupPath, animPath);

log('\n=== board-cell-integrity.test.js on FIX branch anim ===');
r = run(process.execPath, ['--test', 'tests/board-cell-integrity.test.js']);
log(r.stdout || '');
log(`exit: ${r.status}`);
const fixUnitPass = r.status === 0;

log('\n=== board-cell-single-number (prep slot swap) on FIX anim ===');
r = run('npx', ['playwright', 'test', 'tests/e2e/board-cell-single-number.spec.mjs', '-g', 'prep slot swap', '--reporter=line']);
log(r.stdout || '');
log(`exit: ${r.status}`);
const fixE2ePass = r.status === 0;

log('\n=== SUMMARY ===');
log(`main unit FAIL expected: ${mainUnitFail}`);
log(`main e2e FAIL expected: ${mainE2eFail}`);
log(`fix unit PASS: ${fixUnitPass}`);
log(`fix e2e PASS: ${fixE2ePass}`);

import { mkdirSync, writeFileSync as ws } from 'node:fs';
mkdirSync(join(root, 'artifacts/board-concat-bug'), { recursive: true });
ws(logPath, lines.join('\n'));

if (!mainUnitFail || !mainE2eFail || !fixUnitPass || !fixE2ePass) {
  process.exit(1);
}
