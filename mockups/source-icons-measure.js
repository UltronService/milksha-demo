/**
 * Font / row-width math for source-icon mockup (mockups only).
 */
(function (root) {
  'use strict';

  const CAP_HEIGHT_RATIO = 58 / 81;
  const NIDIN_ASPECT = 183 / 91;
  const SLOT_WIDTH_FACTOR = 1.32;
  const BASE_GAP_PX = 6;
  const BASE_FONT_PX = 81;
  const MIN_PREP_FONT_PX = 52;
  const READY_TARGET_RATIO = 1.3;
  const READY_MIN_RATIO = 1.2;

  /**
   * @param {number} fontPx
   * @returns {{ iconH: number, slotW: number, gap: number }}
   */
  function metricsAtFont(fontPx) {
    const iconH = fontPx * CAP_HEIGHT_RATIO;
    const slotW = iconH * SLOT_WIDTH_FACTOR;
    const gap = BASE_GAP_PX * (fontPx / BASE_FONT_PX);
    return { iconH: iconH, slotW: slotW, gap: gap };
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} fontPx
   * @param {string} number
   * @returns {number}
   */
  function measureRowWidthPx(ctx, fontPx, number) {
    const m = metricsAtFont(fontPx);
    ctx.font = '400 ' + fontPx + 'px Arial';
    const textW = ctx.measureText(number).width;
    return m.slotW + m.gap + textW;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array<{ number: string }>} samples
   * @param {Array<{ width: number }>} colRects
   * @param {number} fontPx
   * @returns {boolean}
   */
  function allSamplesFit(ctx, samples, colRects, fontPx) {
    for (let i = 0; i < samples.length; i += 1) {
      const col = i < 5 ? 0 : 1;
      const maxW = colRects[col].width - 12;
      const rowW = measureRowWidthPx(ctx, fontPx, samples[i].number);
      if (rowW > maxW) {
        return false;
      }
    }
    return true;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array<{ number: string }>} samples
   * @param {Array<{ width: number }>} colRects
   * @param {number} [hiPx]
   * @returns {number}
   */
  function maxFontForSamples(ctx, samples, colRects, hiPx) {
    let lo = MIN_PREP_FONT_PX;
    let hi = hiPx || 110;
    let best = lo;
    while (hi - lo > 0.25) {
      const mid = (lo + hi) / 2;
      if (allSamplesFit(ctx, samples, colRects, mid)) {
        best = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return best;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array<{ number: string }>} prepSamples
   * @param {Array<{ number: string }>} readySamples
   * @param {Array<{ width: number }>} prepCols
   * @param {Array<{ width: number }>} readyCols
   * @returns {{ prepFont: number, readyFont: number, ratio: number, meetsMin: boolean, targetRatio: number }}
   */
  function computeBothZoneFonts(ctx, prepSamples, readySamples, prepCols, readyCols) {
    let lo = MIN_PREP_FONT_PX;
    let hi = 96;
    let bestPrep = lo;
    let usedRatio = READY_TARGET_RATIO;

    while (hi - lo > 0.2) {
      const mid = (lo + hi) / 2;
      const readyTry = mid * READY_TARGET_RATIO;
      if (
        allSamplesFit(ctx, prepSamples, prepCols, mid) &&
        allSamplesFit(ctx, readySamples, readyCols, readyTry)
      ) {
        bestPrep = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }

    let prepFont = bestPrep;
    let readyFont = prepFont * READY_TARGET_RATIO;
    let ratio = READY_TARGET_RATIO;

    if (!allSamplesFit(ctx, readySamples, readyCols, readyFont)) {
      let rLo = READY_MIN_RATIO;
      let rHi = READY_TARGET_RATIO;
      let bestR = rLo;
      while (rHi - rLo > 0.005) {
        const rMid = (rLo + rHi) / 2;
        if (allSamplesFit(ctx, readySamples, readyCols, prepFont * rMid)) {
          bestR = rMid;
          rLo = rMid;
        } else {
          rHi = rMid;
        }
      }
      usedRatio = bestR;
      ratio = bestR;
      readyFont = prepFont * bestR;
    }

    return {
      prepFont: prepFont,
      readyFont: readyFont,
      ratio: ratio,
      meetsMin: ratio >= READY_MIN_RATIO - 0.001,
      targetRatio: usedRatio,
    };
  }

  root.MilkshaSourceIconMeasure = {
    CAP_HEIGHT_RATIO: CAP_HEIGHT_RATIO,
    NIDIN_ASPECT: NIDIN_ASPECT,
    SLOT_WIDTH_FACTOR: SLOT_WIDTH_FACTOR,
    BASE_GAP_PX: BASE_GAP_PX,
    READY_TARGET_RATIO: READY_TARGET_RATIO,
    READY_MIN_RATIO: READY_MIN_RATIO,
    metricsAtFont: metricsAtFont,
    measureRowWidthPx: measureRowWidthPx,
    maxFontForSamples: maxFontForSamples,
    computeBothZoneFonts: computeBothZoneFonts,
  };
})(typeof window !== 'undefined' ? window : globalThis);
