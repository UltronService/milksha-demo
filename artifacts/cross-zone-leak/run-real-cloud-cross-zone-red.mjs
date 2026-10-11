#!/usr/bin/env node
/**
 * RED: real cloud zz-qa-ci-store — exit 1 when cross-zone numbers appear on sampled frames.
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { extractCommitSiteRoot } from '../pr53-live/real-cloud-harness.mjs';
import { readCrossZoneViolations } from './cross-zone-assert.mjs';
import { readFrameEvidence, inferMotionInFlight } from './frame-evidence.mjs';
import {
  installRealCloudRoutes,
  waitOnline,
  fireTicket,
  addTicket,
} from '../pr53-live/real-cloud-harness.mjs';
import { teardownLiveCloudSession } from '../../tests/e2e/live-cloud-teardown.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ART = join(dirname(fileURLToPath(import.meta.url)));
const SHA = process.env.CROSS_ZONE_SITE_SHA || '4146812';
const CYCLES = Number(process.env.CROSS_ZONE_CYCLES || 10);
const VP = { width: 1920, height: 1080 };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function slotForNumber(slots, num) {
  const hit = slots.find((s) => s.num === num);
  return hit ? hit.slot : null;
}

async function main() {
  mkdirSync(ART, { recursive: true });
  const { dir, cleanup } = await extractCommitSiteRoot(SHA, ROOT);
  const allViolations = [];
  const failingFrames = [];
  let cycleApplyStartIdx = 0;
  try {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: VP });
    ctx.setDefaultTimeout(180000);
    await installRealCloudRoutes(ctx, dir);
    const board = await ctx.newPage();
    const ctrl = await ctx.newPage();
    await waitOnline(board, ctrl);
    await teardownLiveCloudSession(ctrl, board);
    await board.evaluate(() => {
      if (window.__pr53Diag) {
        window.__pr53Diag.applyPayloadCalls = [];
      }
    });
    for (let i = 0; i < 12; i += 1) {
      await addTicket(ctrl, board, 'preparing', String(7100 + i), 'prep');
    }
    for (let i = 0; i < 12; i += 1) {
      await addTicket(ctrl, board, 'ready', String(8100 + i), 'ready');
    }
    for (let c = 0; c < CYCLES; c += 1) {
      cycleApplyStartIdx = await board.evaluate(
        () => window.__pr53Diag?.applyPayloadCalls?.length ?? 0,
      );
      await board.waitForTimeout(5200);
      await fireTicket(ctrl, 'preparing', String(7200 + c));
      const t0 = Date.now();
      while (Date.now() - t0 < 6500) {
        const tMs = Date.now() - t0;
        const v = await readCrossZoneViolations(board);
        if (!v.ok && v.violations?.length) {
          const evidence = await readFrameEvidence(board);
          const applySinceCycle = await board.evaluate((start) => {
            const all = window.__pr53Diag?.applyPayloadCalls ?? [];
            return all.slice(start);
          }, cycleApplyStartIdx);
          for (const x of v.violations) {
            const zoneSlots = x.zone === 'ready' ? evidence.slots.ready : evidence.slots.prep;
            const row = {
              cycle: c,
              tMs,
              number: x.number,
              zone: x.zone,
              slot: slotForNumber(zoneSlots, x.number),
              indicator: x.indicator,
              motionInFlight: inferMotionInFlight(evidence.motion),
              motion: evidence.motion,
              slots: evidence.slots,
              snapshot: evidence.snapshot,
              applyPayloadSinceCycleStart: applySinceCycle,
              applyPayloadJustBefore: applySinceCycle.slice(-8),
            };
            allViolations.push(row);
            if (failingFrames.length < 15) {
              failingFrames.push(row);
            }
          }
        }
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
    store: 'zz-qa-ci-store',
    sha: SHA,
    cycles: CYCLES,
    viewport: `${VP.width}x${VP.height}`,
    violationEvents: allViolations.length,
    uniqueViolationCount: unique.length,
    uniqueViolations: unique.map((u) => ({
      cycle: u.cycle,
      number: u.number,
      zone: u.zone,
      slot: u.slot,
      motionInFlight: u.motionInFlight,
    })),
    red: unique.length > 0,
    exitCode: unique.length > 0 ? 1 : 0,
  };
  writeFileSync(join(ART, 'real-cloud-red-result.json'), JSON.stringify(out, null, 2));
  writeFileSync(join(ART, 'real-cloud-red-failing-frames.json'), JSON.stringify(failingFrames, null, 2));
  writeFileSync(
    join(ART, 'REAL-CLOUD-RED-RUN.md'),
    `# Real-cloud RED run\n\n- red: ${out.red}\n- unique violations: ${out.uniqueViolationCount}\n- events: ${out.violationEvents}\n`,
  );
  console.log(JSON.stringify(out, null, 2));
  process.exit(unique.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
