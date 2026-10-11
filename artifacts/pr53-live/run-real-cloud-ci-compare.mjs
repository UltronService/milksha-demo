#!/usr/bin/env node
/**
 * CI / manual: real cloud zz-qa-ci-store, 30-round page-turn, two SHAs via git archive site routes.
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  runRealCloudPageTurn,
  buildCompareTable,
  extractCommitSiteRoot,
} from './real-cloud-harness.mjs';
import { LIVE_CLOUD_STORE_ID } from '../../tests/e2e/live-cloud-config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ART = join(ROOT, 'artifacts', 'pr53-live');
const COMMITS = [
  { sha: '4146812', label: 'pre-pr53' },
  { sha: '0ed3056', label: 'post-pr53' },
];

async function runCommit(sha) {
  const { dir, cleanup } = await extractCommitSiteRoot(sha, ROOT);
  try {
    const r1080 = await runRealCloudPageTurn(dir, { w: 1920, h: 1080, tag: '1080' }, sha);
    const r4k = await runRealCloudPageTurn(dir, { w: 3840, h: 2160, tag: '4k' }, sha);
    return { sha, r1080, r4k };
  } finally {
    cleanup();
  }
}

async function main() {
  if (!process.env.MILKSHA_FIREBASE_API_KEY) {
    console.warn('MILKSHA_FIREBASE_API_KEY unset — browser uses public firebase.js from Pages');
  }
  mkdirSync(ART, { recursive: true });
  const results = {};
  for (const { sha, label } of COMMITS) {
    process.stderr.write(`\n=== real cloud ${label} (${sha}) store=${LIVE_CLOUD_STORE_ID} ===\n`);
    results[sha] = await runCommit(sha);
    writeFileSync(join(ART, `real-cloud-${sha}-1080.json`), JSON.stringify(results[sha].r1080, null, 2));
    writeFileSync(join(ART, `real-cloud-${sha}-4k.json`), JSON.stringify(results[sha].r4k, null, 2));
  }
  const table = buildCompareTable(
    results['4146812'].r1080,
    results['0ed3056'].r1080,
    results['4146812'].r4k,
    results['0ed3056'].r4k,
  );
  const out = {
    store: LIVE_CLOUD_STORE_ID,
    commits: COMMITS,
    ...table,
    hypothesis1: {
      crossZoneRoundsBefore: results['4146812'].r1080.crossZoneRoundCount + results['4146812'].r4k.crossZoneRoundCount,
      crossZoneRoundsAfter: results['0ed3056'].r1080.crossZoneRoundCount + results['0ed3056'].r4k.crossZoneRoundCount,
      note: 'prep 7xxx visible in ready zone on stable settled frames',
    },
  };
  writeFileSync(join(ART, 'real-cloud-compare-table.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
