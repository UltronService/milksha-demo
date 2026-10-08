#!/usr/bin/env node
/**
 * Run public-pages-pr27-live-qa N times per context (fresh + legacy-key).
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'pr27-matrix');
const RUNS = Number(process.env.PR27_MATRIX_RUNS || '3');

mkdirSync(ART, { recursive: true });

function runOnce(label) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [join(ROOT, 'scripts/public-pages-pr27-live-qa.mjs')], {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.stderr.on('data', (d) => {
      out += d.toString();
    });
    child.on('close', (code) => {
      let results = null;
      try {
        results = JSON.parse(readFileSync(join(ROOT, 'artifacts/pr27live/results.json'), 'utf8'));
      } catch {
        results = null;
      }
      resolve({ label, code, results, outTail: out.slice(-2000) });
    });
    child.on('error', reject);
  });
}

async function main() {
  const matrix = { runs: RUNS, items: [] };
  for (let i = 1; i <= RUNS; i += 1) {
    matrix.items.push(await runOnce(`matrix-${i}`));
  }
  matrix.pass = matrix.items.every((x) => {
    if (x.code !== 0 || !x.results) {
      return false;
    }
    const failed = x.results.contexts.flatMap((c) => c.lines).filter((l) => !l.pass);
    return failed.length === 0 && x.results.c030020Final?.empty;
  });
  writeFileSync(join(ART, 'matrix.json'), JSON.stringify(matrix, null, 2));
  console.log(JSON.stringify({ pass: matrix.pass, runs: matrix.items.map((x) => x.code) }, null, 2));
  if (!matrix.pass) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
