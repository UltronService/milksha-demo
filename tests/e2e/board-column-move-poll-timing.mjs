/**
 * Pure timing model for column-move enter sampling (unit-tested, no Playwright).
 */

/**
 * @param {string | null | undefined} transform
 */
export function transformTranslateY(transform) {
  if (!transform || transform === 'none') {
    return 0;
  }
  const m = transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([^,]+),\s*([^)]+)\)/);
  if (m) {
    return Number.parseFloat(m[2]) || 0;
  }
  const t = transform.match(/translate\([^,]*,\s*([^)]+)\)/);
  if (t) {
    return Number.parseFloat(t[1]) || 0;
  }
  return 0;
}

/** Legacy: poll loop starts at t=0 while trigger runs concurrently. */
export function legacyParallelSampleTimesMs(sampleCount, intervalMs) {
  return Array.from({ length: sampleCount }, (_, i) => i * intervalMs);
}

/** Fixed: first sample at column-move start, then fixed interval. */
export function triggerFirstSampleTimesMs(sampleCount, intervalMs, animStartMs) {
  return Array.from({ length: sampleCount }, (_, i) => animStartMs + i * intervalMs);
}

/**
 * @param {number} timeMs
 * @param {{ animStartMs: number, durationMs: number, peakTranslateY: number, settledTop: number }} profile
 */
export function synthesizeEnterSampleAtMs(timeMs, profile) {
  if (timeMs < profile.animStartMs) {
    return null;
  }
  if (timeMs >= profile.animStartMs + profile.durationMs) {
    return {
      opacity: '1',
      transform: 'none',
      top: profile.settledTop,
      left: 1034.703125,
      float: false,
    };
  }
  const u = (timeMs - profile.animStartMs) / profile.durationMs;
  const ty = profile.peakTranslateY * (1 - u);
  return {
    opacity: '1',
    transform: 'matrix(1, 0, 0, 1, 0, ' + ty + ')',
    top: profile.settledTop + ty,
    left: 1034.703125,
    float: false,
  };
}

/** Same predicate as assertEnterFromAboveMotion without throwing. */
export function enterFromAboveWouldPass(samples) {
  const present = samples.filter(Boolean);
  if (present.length === 0) {
    return false;
  }
  const tops = present.map((s) => s.top);
  const delta = Math.max(...tops) - Math.min(...tops);
  return present.some((s) => transformTranslateY(s.transform) < -8) || delta > 12;
}
