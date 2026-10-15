/**
 * UI/UX source-icon row layout (preview + max-font math). F = --milksha-num-font.
 */
(function (root) {
  'use strict';

  const CAP_HEIGHT_RATIO = 58 / 81;
  const SLOT_W_FACTOR = 1;
  const GAP_FACTOR = 0.2;
  const FP_UBER_HEIGHT_FACTOR = 0.8;
  const FP_WIDTH_OVER_HEIGHT = 1.02;
  const NIDIN_HEIGHT_FACTOR = 0.5;

  /**
   * @param {number} fontPx F
   * @returns {{ slotW: number, gap: number, capHeight: number }}
   */
  function metricsAtFont(fontPx) {
    return {
      slotW: fontPx * SLOT_W_FACTOR,
      gap: fontPx * GAP_FACTOR,
      capHeight: fontPx * CAP_HEIGHT_RATIO,
    };
  }

  /**
   * Row width: 1.0F slot + 0.2F gap + number (store keeps empty slot).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} fontPx
   * @param {string} text
   */
  function rowWidthPx(ctx, fontPx, text) {
    const m = metricsAtFont(fontPx);
    ctx.font = '400 ' + fontPx + 'px Arial, Arimo, sans-serif';
    return m.slotW + m.gap + ctx.measureText(text).width;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} fontPx
   * @param {string} text
   */
  function storeRowWidthPx(ctx, fontPx, text) {
    return rowWidthPx(ctx, fontPx, text);
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} fontPx
   * @param {string} text
   */
  function iconRowWidthPx(ctx, fontPx, text) {
    return rowWidthPx(ctx, fontPx, text);
  }

  root.MilkshaSourceIconsUiuxSpec = {
    CAP_HEIGHT_RATIO: CAP_HEIGHT_RATIO,
    SLOT_W_FACTOR: SLOT_W_FACTOR,
    GAP_FACTOR: GAP_FACTOR,
    FP_UBER_HEIGHT_FACTOR: FP_UBER_HEIGHT_FACTOR,
    FP_WIDTH_OVER_HEIGHT: FP_WIDTH_OVER_HEIGHT,
    NIDIN_HEIGHT_FACTOR: NIDIN_HEIGHT_FACTOR,
    metricsAtFont: metricsAtFont,
    rowWidthPx: rowWidthPx,
    storeRowWidthPx: storeRowWidthPx,
    iconRowWidthPx: iconRowWidthPx,
  };
})(typeof window !== 'undefined' ? window : globalThis);
