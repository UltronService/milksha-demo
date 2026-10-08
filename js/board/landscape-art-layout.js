/**
 * Measured from milksha-board-numbers-ref-1007.jpg @ 1920×1080 (see scripts/measure-board-ref-layout.mjs).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});

  /** @type {{ left: number, top: number, width: number, height: number }} */
  const PREP_CREAM = { left: 101, top: 341, width: 798, height: 639 };
  /** @type {{ left: number, top: number, width: number, height: number }} */
  const READY_CREAM = { left: 1021, top: 341, width: 798, height: 638 };

  const NUM_FONT_PX = 62;
  const TITLE_GUARD_MAX_Y = 330;

  /**
   * Grid index 0–4 left column, 5–9 right column (newest first in data → index 0).
   * Centers in 1920×1080 board coordinates.
   */
  const PREP_CELL_CENTERS = [
    { cx: 327.14, cy: 437.48 },
    { cx: 333.46, cy: 548.39 },
    { cx: 332.37, cy: 660.01 },
    { cx: 331.4, cy: 770.28 },
    { cx: 331.37, cy: 880.07 },
    { cx: 726.99, cy: 439.43 },
    { cx: 721.75, cy: 546.51 },
    { cx: 730.18, cy: 660.1 },
    { cx: 730.23, cy: 770.06 },
    { cx: 730.42, cy: 880.12 },
  ];

  const READY_CELL_CENTERS = [
    { cx: 1244.55, cy: 437.46 },
    { cx: 1250.71, cy: 548.37 },
    { cx: 1249.91, cy: 659.99 },
    { cx: 1247.88, cy: 770.21 },
    { cx: 1248.96, cy: 880.04 },
    { cx: 1644.35, cy: 439.4 },
    { cx: 1638.91, cy: 546.48 },
    { cx: 1647.63, cy: 659.98 },
    { cx: 1647.65, cy: 770.0 },
    { cx: 1648.02, cy: 880.06 },
  ];

  const REF_TEXT_HEIGHT_PX = 58;

  /**
   * @param {'prep' | 'ready'} zone
   * @returns {{ left: number, top: number, width: number, height: number }}
   */
  function creamRectForZone(zone) {
    return zone === 'ready' ? READY_CREAM : PREP_CREAM;
  }

  /**
   * @param {'prep' | 'ready'} zone
   * @param {number} gridIndex 0..9
   * @returns {{ cx: number, cy: number }}
   */
  function cellCenterBoard(zone, gridIndex) {
    const list = zone === 'ready' ? READY_CELL_CENTERS : PREP_CELL_CENTERS;
    const c = list[gridIndex];
    if (!c) {
      return { cx: 0, cy: 0 };
    }
    return { cx: c.cx, cy: c.cy };
  }

  /**
   * @param {number} zoneLeft board zone origin x
   * @param {{ cx: number, cy: number }} center
   * @returns {{ left: number, top: number }}
   */
  function cellPositionInZone(zoneLeft, center) {
    return { left: center.cx - zoneLeft, top: center.cy };
  }

  QMS.Board = QMS.Board || {};
  QMS.Board.LandscapeArtLayout = {
    PREP_CREAM: PREP_CREAM,
    READY_CREAM: READY_CREAM,
    NUM_FONT_PX: NUM_FONT_PX,
    TITLE_GUARD_MAX_Y: TITLE_GUARD_MAX_Y,
    PREP_CELL_CENTERS: PREP_CELL_CENTERS,
    READY_CELL_CENTERS: READY_CELL_CENTERS,
    REF_TEXT_HEIGHT_PX: REF_TEXT_HEIGHT_PX,
    creamRectForZone: creamRectForZone,
    cellCenterBoard: cellCenterBoard,
    cellPositionInZone: cellPositionInZone,
  };
})(typeof window !== 'undefined' ? window : globalThis);
