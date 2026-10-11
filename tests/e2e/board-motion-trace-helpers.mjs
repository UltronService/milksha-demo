import { expect } from '@playwright/test';
import { urlsLocalHomePoc } from './harness.mjs';
import { prepPayload, applyPayload, sequentialNumbers, readyPayload } from './board-column-move-helpers.mjs';

export const GRID_ROWS = 5;

export function boardUrlWithMotionTrace(extraQuery = '') {
  const { board } = urlsLocalHomePoc();
  const sep = extraQuery ? '&' : '';
  return `${board}&motionTrace=1${sep}${extraQuery}`;
}

export async function primeBoardWithMotionTrace(page) {
  await page.goto(boardUrlWithMotionTrace());
  await page.waitForFunction(() => Boolean(window.QMS?.runtime?.applyPayload), undefined, {
    timeout: 25000,
  });
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([], { silent: true });
    window.QMS.runtime.applyPayload([], { silent: true });
    window.__milkshaMotionTrace.clear();
  });
}

export async function minExpectedTraceFrames(page, motionType) {
  return page.evaluate((type) => {
    const cfg = window.QMS.MilkshaBoardAnimConfig.getConfig();
    let ms = cfg.opacityInMs;
    if (type === 'page-turn') {
      ms = cfg.pageDurationMs;
    } else if (type === 'column-move') {
      ms = cfg.columnMoveMs;
    }
    return Math.max(2, Math.ceil(ms / 50) + 1);
  }, motionType);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} motionType
 */
export async function waitForMotionSession(page, motionType) {
  const minFrames = await minExpectedTraceFrames(page, motionType);
  await page.waitForFunction(
    (expected) => {
      const trace = window.__milkshaMotionTrace;
      if (!trace) {
        return false;
      }
      const sessions = trace.get().filter((s) => s.motionType === expected.type && s.endedAt);
      return sessions.some((s) => {
        const v = trace.validateSession(s);
        return v.valid && s.frames.length >= expected.minFrames;
      });
    },
    { type: motionType, minFrames },
    { timeout: 12000 },
  );
  return page.evaluate((type) => {
    const sessions = window.__milkshaMotionTrace.get().filter((s) => s.motionType === type && s.endedAt);
    return sessions[sessions.length - 1];
  }, motionType);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} motionType
 */
export async function assertMotionTraceAndAnalyze(page, motionType) {
  const session = await waitForMotionSession(page, motionType);
  const validity = await page.evaluate(
    (s) => window.__milkshaMotionTrace.validateSession(s),
    session,
  );
  expect(validity.valid, JSON.stringify(validity)).toBe(true);
  expect(session.frames.length).toBeGreaterThan(0);
  const analysis = await page.evaluate((type) => {
    const sessions = window.__milkshaMotionTrace.get().filter((s) => s.motionType === type);
    const last = sessions[sessions.length - 1];
    return window.__milkshaMotionTrace.analyzeSession(last);
  }, motionType);
  expect(analysis.valid !== false).toBe(true);
  expect(analysis).toHaveProperty('failures');
  if (motionType === 'column-move' || motionType === 'backfill') {
    for (const f of analysis.failures) {
      expect(f.rule).toBeTruthy();
      expect(f.frame).toBeGreaterThanOrEqual(0);
    }
  }
  return { session, analysis };
}

export async function assertMotionTraceDisabledOnDefaultBoard(page) {
  const { board } = urlsLocalHomePoc();
  await page.goto(board);
  await page.waitForFunction(() => Boolean(window.QMS?.MilkshaBoardMotionTrace), undefined, { timeout: 25000 });
  const state = await page.evaluate(() => ({
    enabled: window.QMS.MilkshaBoardMotionTrace.isEnabled(),
    hasPublic: typeof window.__milkshaMotionTrace !== 'undefined',
  }));
  expect(state.enabled).toBe(false);
  expect(state.hasPublic).toBe(false);
}

export { prepPayload, readyPayload, applyPayload, sequentialNumbers };
