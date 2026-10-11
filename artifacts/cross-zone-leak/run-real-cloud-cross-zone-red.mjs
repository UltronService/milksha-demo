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
import { expandControllerZone } from '../../tests/e2e/harness.mjs';
import {
  installHypothesis0Capture,
  readController7112,
  lookup7112InApplyLog,
  summarizeHypothesis0,
} from './hypothesis0-capture.mjs';
import {
  readFirestoreTodayBoard,
  lastPushNumbersSince,
  classifyLeakRow,
  renderHypothesis0Markdown,
} from './hypothesis0-cycle-table.mjs';

async function expandClear(ctrl, board) {
  await expandControllerZone(ctrl, 'sec-special');
  await ctrl.click('[data-testid="btn-clear-now"]');
  await ctrl.click('[data-testid="btn-sim-stop"]').catch(() => {});
  await board.waitForTimeout(4000);
  await board.waitForFunction(
    () => document.querySelectorAll('.milksha-board-chip').length === 0,
    undefined,
    { timeout: 120000 },
  );
  await board.evaluate(() => {
    if (window.__pr53Diag) {
      window.__pr53Diag.applyPayloadCalls = [];
    }
  });
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ART = join(dirname(fileURLToPath(import.meta.url)));
const SHA = process.env.CROSS_ZONE_SITE_SHA || '4146812';
const CYCLES = Number(process.env.CROSS_ZONE_CYCLES || 30);
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
  let cyclePushStartIdx = 0;
  /** @type {ReturnType<typeof summarizeHypothesis0> & { cycle?: number } | null} */
  let hypothesis0Verdict = null;
  /** @type {Array<object>} */
  const hypothesis0CycleRows = [];
  const capturedH0Cycles = new Set();
  try {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: VP });
    ctx.setDefaultTimeout(180000);
    const netLog = await installHypothesis0Capture(ctx);
    await installRealCloudRoutes(ctx, dir);
    const board = await ctx.newPage();
    const ctrl = await ctx.newPage();
    await waitOnline(board, ctrl);
    await expandClear(ctrl, board);
    for (let i = 0; i < 12; i += 1) {
      await addTicket(ctrl, board, 'preparing', String(7100 + i), 'prep');
    }
    for (let i = 0; i < 12; i += 1) {
      await addTicket(ctrl, board, 'ready', String(8100 + i), 'ready');
    }
    for (let c = 0; c < CYCLES; c += 1) {
      cyclePushStartIdx = netLog.devCommands.length;
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
            const leak7112 = x.number === '7112' && x.zone === 'ready';
            if (leak7112 && c >= 27 && c <= 29 && !capturedH0Cycles.has(c)) {
              capturedH0Cycles.add(c);
              const push = lastPushNumbersSince(netLog.devCommands, cyclePushStartIdx);
              const firestore = await readFirestoreTodayBoard(ctrl);
              const lastApply = await board.evaluate(() => window.__pr53Diag?.lastAppliedPayload ?? null);
              const triplet = {
                cycle: c,
                tMs,
                push: push
                  ? { preparing: push.preparing || [], ready: push.ready || [] }
                  : { preparing: [], ready: [] },
                firestore,
                board: {
                  snapshot: evidence.snapshot,
                  slots: evidence.slots,
                },
                apply7112: lastApply?.item7112 || lookup7112InApplyLog(applySinceCycle).slice(-1)[0]?.item7112,
              };
              triplet.abc = classifyLeakRow(triplet);
              hypothesis0CycleRows.push(triplet);
            }
            if (!hypothesis0Verdict && v.violations.some((z) => z.number === '7112')) {
              const allApply = await board.evaluate(() => window.__pr53Diag?.applyPayloadCalls ?? []);
              const controller = await readController7112(ctrl);
              hypothesis0Verdict = summarizeHypothesis0({
                apply7112: lookup7112InApplyLog(allApply),
                devCommands: netLog.devCommands,
                todayBoardReads: netLog.todayBoardReads,
                controller,
                frame: evidence,
              });
              hypothesis0Verdict.cycle = c;
              hypothesis0Verdict.tMs = tMs;
              hypothesis0Verdict.applyJustBeforeLeak = applySinceCycle.slice(-3);
              hypothesis0Verdict.pushNumbersWith7112 = netLog.devCommands.filter(
                (d) => d.type === 'push_numbers' && (d.has7112InReady || d.has7112InPreparing),
              );
              hypothesis0Verdict.cycleTable = hypothesis0CycleRows;
            }
          }
        }
        await sleep(50);
      }
      if (c >= 27 && c <= 29 && !capturedH0Cycles.has(c)) {
        const has7112Ready = await board.evaluate(() => {
          const ready = (window.QMS?.runtime?.getSnapshot?.()?.ready ?? []).map((it) => String(it.number));
          return ready.includes('7112');
        });
        if (has7112Ready) {
          capturedH0Cycles.add(c);
          const evidence = await readFrameEvidence(board);
          const push = lastPushNumbersSince(netLog.devCommands, cyclePushStartIdx);
          const firestore = await readFirestoreTodayBoard(ctrl);
          const lastApply = await board.evaluate(() => window.__pr53Diag?.lastAppliedPayload ?? null);
          const triplet = {
            cycle: c,
            tMs: 'cycle-end',
            push: push
              ? { preparing: push.preparing || [], ready: push.ready || [] }
              : { preparing: [], ready: [] },
            firestore,
            board: { snapshot: evidence.snapshot, slots: evidence.slots },
            apply7112: lastApply?.item7112,
          };
          triplet.abc = classifyLeakRow(triplet);
          hypothesis0CycleRows.push(triplet);
        }
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
  if (hypothesis0CycleRows.length > 0) {
    writeFileSync(join(ART, 'hypothesis0-cycle-table.json'), JSON.stringify(hypothesis0CycleRows, null, 2));
    writeFileSync(
      join(ART, 'hypothesis0-cycle-table.md'),
      renderHypothesis0Markdown(hypothesis0CycleRows, `store=${out.store} sha=${SHA}`),
    );
    const { spawnSync } = await import('node:child_process');
    spawnSync('node', [join(ART, 'merge-hypothesis0-into-md.mjs')], { stdio: 'inherit' });
  }
  if (hypothesis0Verdict) {
    writeFileSync(join(ART, 'hypothesis0-verdict.json'), JSON.stringify(hypothesis0Verdict, null, 2));
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(unique.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
