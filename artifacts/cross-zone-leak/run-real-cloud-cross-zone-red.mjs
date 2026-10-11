#!/usr/bin/env node
/**
 * RED: real cloud zz-qa-ci-store — fails (exit 1) if any sampled frame has cross-zone numbers.
 * Uses git archive site root (default 4146812) + Pages route.
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { extractCommitSiteRoot } from '../pr53-live/real-cloud-harness.mjs';
import { readCrossZoneViolations } from './cross-zone-assert.mjs';
import {
  installRealCloudRoutes,
  publicUrls,
  waitOnline,
  clearNow,
  fireTicket,
  addTicket,
} from '../pr53-live/real-cloud-harness.mjs';
import { teardownLiveCloudSession } from '../../tests/e2e/live-cloud-teardown.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ART = join(dirname(fileURLToPath(import.meta.url)));
const SHA = process.env.CROSS_ZONE_SITE_SHA || '4146812';
const CYCLES = Number(process.env.CROSS_ZONE_CYCLES || 10);
const VP = { w: 1920, h: 1080 };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  mkdirSync(ART, { recursive: true });
  const { dir, cleanup } = await extractCommitSiteRoot(SHA, ROOT);
  const allViolations = [];
  const frames = [];
  try {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: VP });
    ctx.setDefaultTimeout(180000);
    await installRealCloudRoutes(ctx, dir);
    const board = await ctx.newPage();
    const ctrl = await ctx.newPage();
    await waitOnline(board, ctrl);
    await clearNow(ctrl, board);
    for (let i = 0; i < 12; i += 1) {
      await addTicket(ctrl, board, 'preparing', String(7100 + i), 'prep');
    }
    for (let i = 0; i < 12; i += 1) {
      await addTicket(ctrl, board, 'ready', String(8100 + i), 'ready');
    }
    for (let c = 0; c < CYCLES; c += 1) {
      await board.waitForTimeout(5200);
      await fireTicket(ctrl, 'preparing', String(7200 + c));
      const t0 = Date.now();
      while (Date.now() - t0 < 6500) {
        const v = await readCrossZoneViolations(board);
        if (!v.ok && v.violations?.length) {
          for (const x of v.violations) {
            allViolations.push({ cycle: c, tMs: Date.now() - t0, ...x });
          }
        }
        frames.push({ cycle: c, tMs: Date.now() - t0, ...(await readCrossZoneViolations(board)) });
        await sleep(50);
      }
    }
    await teardownLiveCloudSession(ctrl, board);
    await browser.close();
  } finally {
    cleanup();
  }
  const unique = [...new Map(allViolations.map((v) => [`${v.cycle}:${v.zone}:${v.number}`, v])).values()];
  const out = {
    sha: SHA,
    cycles: CYCLES,
    violationEvents: allViolations.length,
    uniqueViolations: unique,
    red: unique.length > 0,
  };
  writeFileSync(join(ART, 'real-cloud-red-result.json'), JSON.stringify(out, null, 2));
  writeFileSync(join(ART, 'real-cloud-red-frames-sample.json'), JSON.stringify(frames.slice(0, 200), null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(unique.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
