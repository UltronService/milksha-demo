/**
 * Regular 2×5 grid on 1007 art (1920×1080). Derived from reference JPEG averages.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});

  const PREP_CREAM = { left: 101, top: 341, width: 798, height: 639 };
  const READY_CREAM = { left: 1021, top: 341, width: 798, height: 638 };

  const NUM_FONT_PX = 81;
  const TITLE_GUARD_MAX_Y = 330;

  /** Column center X (board coords), averaged from reference art per zone. */
  const PREP_COL_CX = [331.15, 727.91];
  const READY_COL_CX = [1248.4, 1645.31];

  /** Row center Y (board coords), uniform pitch from reference row averages. */
  const ROW_CY_FIRST = 438.4425;
  const ROW_CY_PITCH = 110.4075;
  const ROW_CY = [0, 1, 2, 3, 4].map(function (i) {
    return ROW_CY_FIRST + i * ROW_CY_PITCH;
  });

  /** Reference ink metrics for "1907" at NUM_FONT_PX (canvas measureText, Arial). */
  const REF_INK_CAP_HEIGHT_PX = 58;
  const REF_INK_WIDTH_1907_PX = 170.145;
  const REF_INK_SAMPLE_TEXT = '1907';

  const INK_METRIC_TOL_RATIO = 0.05;
  const COL_X_TOL_PX = 2;
  const ROW_PITCH_TOL_PX = 2;

  function creamRectForZone(zone) {
    return zone === 'ready' ? READY_CREAM : PREP_CREAM;
  }

  function colCentersForZone(zone) {
    return zone === 'ready' ? READY_COL_CX : PREP_COL_CX;
  }

  /**
   * @param {'prep' | 'ready'} zone
   * @param {number} gridIndex 0..9 (0–4 left col, 5–9 right col)
   * @returns {{ cx: number, cy: number }}
   */
  function cellCenterBoard(zone, gridIndex) {
    const cols = colCentersForZone(zone);
    const col = gridIndex < 5 ? 0 : 1;
    const row = gridIndex < 5 ? gridIndex : gridIndex - 5;
    return { cx: cols[col], cy: ROW_CY[row] };
  }

  function cellPositionInZone(zoneLeft, center) {
    return { left: center.cx - zoneLeft, top: center.cy };
  }

  QMS.Board = QMS.Board || {};
  QMS.Board.LandscapeArtLayout = {
    PREP_CREAM: PREP_CREAM,
    READY_CREAM: READY_CREAM,
    NUM_FONT_PX: NUM_FONT_PX,
    TITLE_GUARD_MAX_Y: TITLE_GUARD_MAX_Y,
    PREP_COL_CX: PREP_COL_CX,
    READY_COL_CX: READY_COL_CX,
    ROW_CY: ROW_CY,
    REF_INK_CAP_HEIGHT_PX: REF_INK_CAP_HEIGHT_PX,
    REF_INK_WIDTH_1907_PX: REF_INK_WIDTH_1907_PX,
    REF_INK_SAMPLE_TEXT: REF_INK_SAMPLE_TEXT,
    INK_METRIC_TOL_RATIO: INK_METRIC_TOL_RATIO,
    COL_X_TOL_PX: COL_X_TOL_PX,
    ROW_PITCH_TOL_PX: ROW_PITCH_TOL_PX,
    creamRectForZone: creamRectForZone,
    colCentersForZone: colCentersForZone,
    cellCenterBoard: cellCenterBoard,
    cellPositionInZone: cellPositionInZone,
  };
})(typeof window !== 'undefined' ? window : globalThis);
