#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = join(root, 'artifacts', 'store-picker-self-qa', 'e2e-full.json');
const outPath = join(root, 'artifacts', 'store-picker-self-qa', 'e2e-full-summary.json');

const raw = readFileSync(jsonPath, 'utf8');
const report = JSON.parse(raw);
const stats = report.stats || {};
const summary = {
  expected: stats.expected ?? null,
  unexpected: stats.unexpected ?? null,
  skipped: stats.skipped ?? null,
  flaky: stats.flaky ?? null,
  passed: stats.expected != null && stats.unexpected != null ? stats.expected - stats.unexpected : null,
  failed: stats.unexpected ?? null,
  durationMs: stats.duration ?? null,
};
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
