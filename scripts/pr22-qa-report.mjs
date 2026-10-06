#!/usr/bin/env node
/**
 * Run PR22 QA commands and write /opt/cursor/artifacts/pr22-qa-report.json
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = '/opt/cursor/artifacts';
const report = { head: '', unit: null, e2e: [], prodLatency: null, artifacts: [] };

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { ok: r.status === 0, status: r.status, stdout: r.stdout, stderr: r.stderr };
}

mkdirSync(OUT_DIR, { recursive: true });

const head = run('git', ['rev-parse', 'HEAD']);
report.head = head.stdout.trim();

const unit = run('npm', ['test']);
report.unit = { pass: unit.ok, status: unit.status };

const e2eSuites = [
  ['cloud-remote-send', ['tests/e2e/cloud-remote-send.spec.mjs']],
  ['cloud-qa-checklist', ['tests/e2e/cloud-qa-checklist.spec.mjs']],
  ['home-board-stale-storage', ['tests/e2e/home-board-stale-storage.spec.mjs']],
];

for (const [name, args] of e2eSuites) {
  const r = run('npx', ['playwright', 'test', ...args, '--reporter=line'], {
    PR22_FULL_QA: process.env.PR22_FULL_QA || '0',
  });
  report.e2e.push({ name, pass: r.ok, status: r.status, tail: (r.stdout + r.stderr).split('\n').slice(-8).join('\n') });
}

if (process.env.MILKSHA_FIREBASE_API_KEY) {
  const prod = run('node', ['scripts/prod-cloud-qa.mjs']);
  try {
    const lines = prod.stdout.trim().split('\n');
    const jsonLine = lines.filter((l) => l.startsWith('{')).pop();
    report.prodLatency = jsonLine ? JSON.parse(jsonLine) : { raw: prod.stdout };
  } catch {
    report.prodLatency = { pass: prod.ok, raw: prod.stdout };
  }
  report.prodLatencyPass = prod.ok;
} else {
  report.prodLatency = { skipped: 'MILKSHA_FIREBASE_API_KEY not set' };
}

const shots = run('node', ['scripts/capture-cloud-remote-artifacts.mjs']);
report.artifacts.push({
  script: 'capture-cloud-remote-artifacts',
  pass: shots.ok,
  dir: join(OUT_DIR, 'cloud-remote-qa'),
});

writeFileSync(join(OUT_DIR, 'pr22-qa-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.unit.pass && report.e2e.every((e) => e.pass) && shots.ok ? 0 : 1);
