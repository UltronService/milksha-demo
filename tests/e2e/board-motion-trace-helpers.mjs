import { expect } from '@playwright/test';
import { urlsLocalHomePoc } from './harness.mjs';
import { prepPayload, applyPayload, sequentialNumbers } from './board-column-move-helpers.mjs';

const GRID_ROWS = 5;

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

export async function minExpectedTraceFrames(page) {
  const opacityInMs = await page.evaluate(() => window.QMS.MilkshaBoardAnimConfig.getConfig().opacityInMs);
  return Math.max(2, Math.ceil(opacityInMs / 100));
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} motionType
 */
export async function waitForMotionSession(page, motionType) {
  const minFrames = await minExpectedTraceFrames(page);
  await page.waitForFunction(
    (expected) => {
      const trace = window.__milkshaMotionTrace;
      if (!trace) {
        return false;
      }
      const sessions = trace.get().filter((s) => s.motionType === expected.type && s.endedAt);
      return sessions.some((s) => s.frames.length >= expected.minFrames);
    },
    { type: motionType, minFrames },
    { timeout: 8000 },
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
  expect(session.frames.length).toBeGreaterThan(0);
  expect(session.frames[0].chips).toBeDefined();
  const analysis = await page.evaluate((type) => {
    const sessions = window.__milkshaMotionTrace.get().filter((s) => s.motionType === type);
    const last = sessions[sessions.length - 1];
    return window.__milkshaMotionTrace.analyzeSession(last);
  }, motionType);
  expect(analysis).toHaveProperty('outsideCream');
  expect(analysis).toHaveProperty('coversTitle');
  expect(analysis).toHaveProperty('overlap');
  expect(analysis).toHaveProperty('diagonalMotion');
  return { session, analysis };
}

export async function assertMotionTraceDisabledOnDefaultBoard(page) {
  const { board } = urlsLocalHomePoc();
  await page.goto(board);
  await page.waitForFunction(() => Boolean(window.QMS?.MilkshaBoardMotionTrace), undefined, { timeout: 25000 });
  const state = await page.evaluate(() => ({
    enabled: window.QMS.MilkshaBoardMotionTrace.isEnabled(),
    hasPublic: typeof window.__milkshaMotionTrace !== 'undefined',
    rafPatched: Boolean(window.__milkshaMotionTraceRafPatched),
  }));
  expect(state.enabled).toBe(false);
  expect(state.hasPublic).toBe(false);
  expect(state.rafPatched).toBe(false);
}

export { prepPayload, applyPayload, sequentialNumbers, GRID_ROWS };
