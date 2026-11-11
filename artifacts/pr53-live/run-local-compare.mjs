#!/usr/bin/env node
/**
 * Compare QA metrics on fake-cloud + local static server for two SHAs.
 * Usage: node artifacts/pr53-live/run-local-compare.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareSiteRootForCommit, runFullSuite } from './qa-harness-core.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ART = join(ROOT, 'artifacts', 'pr53-live');
const COMMITS = [
  { sha: '4146812', label: 'pre-pr53' },
  { sha: '0ed3056', label: 'post-pr53' },
];

function summarize(result) {
  const mf = result.mainFlows;
  const latOver3 = mf.reduce((s, f) => s + f.latOver3Count, 0);
  const latMax = Math.max(...mf.map((f) => f.latMax), 0);
  const d1080 = result.pageTurnDesync['1080'];
  const d4k = result.pageTurnDesync['4k'];
  return {
    mainFlowLatOver3Total: latOver3,
    mainFlowLatMaxMs: latMax,
    pageMismatch1080: d1080.pageMismatchEvents,
    pageMismatch4k: d4k.pageMismatchEvents,
    missingOver3s1080: d1080.missingOver3sCount,
    missingOver3s4k: d4k.missingOver3sCount,
    correctedMismatch1080: d1080.pageMismatchCorrectedEvents,
    correctedMismatch4k: d4k.pageMismatchCorrectedEvents,
    midNew1080: d1080.midNewCount,
    midNew4k: d4k.midNewCount,
  };
}

function compareRow(before, after) {
  const keys = Object.keys(before);
  const row = {};
  for (const k of keys) {
    const b = before[k];
    const a = after[k];
    let verdict = 'same';
    if (typeof b === 'number' && typeof a === 'number') {
      if (a > b) {
        verdict = 'WORSE';
      } else if (a < b) {
        verdict = 'better';
      } else {
        verdict = 'not fixed';
      }
    }
    row[k] = { before: b, after: a, verdict };
  }
  return row;
}

async function main() {
  mkdirSync(ART, { recursive: true });
  const results = {};
  for (const { sha, label } of COMMITS) {
    process.stderr.write(`\n=== ${label} (${sha}) ===\n`);
    const prep = await prepareSiteRootForCommit(sha, ROOT);
    try {
      results[sha] = await runFullSuite(`${label}:${sha}`);
      writeFileSync(join(ART, `results-${sha}.json`), JSON.stringify(results[sha], null, 2));
    } finally {
      prep.cleanup();
    }
  }
  const before = summarize(results[COMMITS[0].sha]);
  const after = summarize(results[COMMITS[1].sha]);
  const table = compareRow(before, after);
  const anyWorse = Object.values(table).some((v) => v.verdict === 'WORSE');
  const out = { beforeSha: COMMITS[0].sha, afterSha: COMMITS[1].sha, anyWorse, table, before, after };
  writeFileSync(join(ART, 'compare-table.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(anyWorse ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
