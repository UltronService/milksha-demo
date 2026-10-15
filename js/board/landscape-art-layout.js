/**
 * Regular 2×5 grid on 1007 art (1920×1080). Derived from reference JPEG averages.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});

  const PREP_CREAM = { left: 101, top: 341, width: 799, height: 639 };
  const READY_CREAM = { left: 1020, top: 341, width: 800, height: 638 };

  const NUM_FONT_PX = 70;
  const TITLE_GUARD_MAX_Y = 330;

  /** Milksha UI ref @ 1920: icon box left = cream.left + offset; right ink inset 91px. */
  const CREAM_LEFT_ICON_OFFSET_PX = [75, 471];
  const CREAM_RIGHT_CONTENT_INSET_PX = 91;
  const COLUMN_MID_GAP_PX = 10;
  const ICON_BOX_PX = 54;
  const ICON_GAP_PX = 14;

  /** @deprecated use CREAM_LEFT_ICON_OFFSET_PX */
  const CREAM_EDGE_INSET_PX = CREAM_LEFT_ICON_OFFSET_PX[0];

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
  const REF_INK_CAP_HEIGHT_PX = (58 / 81) * NUM_FONT_PX;
  const REF_INK_WIDTH_1907_PX = (170.145 / 81) * NUM_FONT_PX;
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

  /**
   * Inner column band inside cream (PR #74 UI/UX preview).
   * @param {'prep' | 'ready'} zone
   * @returns {Array<{ left: number, right: number }>}
   */
  function columnInnerRectsBoard(zone) {
    const cream = creamRectForZone(zone);
    const creamRight = cream.left + cream.width - 1;
    const iconCol0 = cream.left + CREAM_LEFT_ICON_OFFSET_PX[0];
    const iconCol1 = cream.left + CREAM_LEFT_ICON_OFFSET_PX[1];
    const halfGap = COLUMN_MID_GAP_PX / 2;
    return [
      { left: iconCol0, right: iconCol1 - halfGap },
      { left: iconCol1, right: creamRight },
    ];
  }

  /**
   * @param {'prep' | 'ready'} zone
   * @param {0 | 1} col
   * @returns {number}
   */
  function iconBoxLeftBoard(zone, col) {
    const cream = creamRectForZone(zone);
    return cream.left + CREAM_LEFT_ICON_OFFSET_PX[col];
  }

  /**
   * @param {'prep' | 'ready'} zone
   * @param {0 | 1} col
   * @returns {number}
   */
  function expectedNumLeftBoard(zone, col) {
    return iconBoxLeftBoard(zone, col) + ICON_BOX_PX + ICON_GAP_PX;
  }

  /**
   * Art-grid anchor: icon slot left edge + row center Y (matches PR #74 64px preview).
   * @param {'prep' | 'ready'} zone
   * @param {number} gridIndex
   * @returns {{ iconSlotLeft: number, cy: number, columnInner: { left: number, right: number } }}
   */
  function cellAnchorBoard(zone, gridIndex) {
    const col = gridIndex < 5 ? 0 : 1;
    const row = gridIndex < 5 ? gridIndex : gridIndex - 5;
    const inner = columnInnerRectsBoard(zone);
    return {
      iconSlotLeft: inner[col].left,
      cy: ROW_CY[row],
      columnInner: inner[col],
    };
  }

  function cellPositionInZone(zoneLeft, center) {
    return { left: center.cx - zoneLeft, top: center.cy };
  }

  /**
   * @param {number} zoneLeft
   * @param {{ iconSlotLeft: number, cy: number }} anchor
   */
  function cellPositionInZoneFromAnchor(zoneLeft, anchor) {
    return { left: anchor.iconSlotLeft - zoneLeft, top: anchor.cy };
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
    CREAM_EDGE_INSET_PX: CREAM_EDGE_INSET_PX,
    CREAM_LEFT_ICON_OFFSET_PX: CREAM_LEFT_ICON_OFFSET_PX,
    CREAM_RIGHT_CONTENT_INSET_PX: CREAM_RIGHT_CONTENT_INSET_PX,
    ICON_BOX_PX: ICON_BOX_PX,
    ICON_GAP_PX: ICON_GAP_PX,
    COLUMN_MID_GAP_PX: COLUMN_MID_GAP_PX,
    iconBoxLeftBoard: iconBoxLeftBoard,
    expectedNumLeftBoard: expectedNumLeftBoard,
    creamRectForZone: creamRectForZone,
    colCentersForZone: colCentersForZone,
    columnInnerRectsBoard: columnInnerRectsBoard,
    cellCenterBoard: cellCenterBoard,
    cellAnchorBoard: cellAnchorBoard,
    cellPositionInZone: cellPositionInZone,
    cellPositionInZoneFromAnchor: cellPositionInZoneFromAnchor,
  };
})(typeof window !== 'undefined' ? window : globalThis);
