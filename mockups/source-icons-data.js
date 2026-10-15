/**
 * Static sample rows for source-icon mockups only (not loaded by production board).
 */
(function (root) {
  'use strict';

  const PREP_CREAM = { left: 101, top: 341, width: 798, height: 639 };
  const READY_CREAM = { left: 1021, top: 341, width: 798, height: 638 };

  const PREP_COL_CX = [331.15, 727.91];
  const READY_COL_CX = [1248.4, 1645.31];
  const ROW_CY_FIRST = 438.4425;
  const ROW_CY_PITCH = 110.4075;
  const ROW_CY = [0, 1, 2, 3, 4].map(function (i) {
    return ROW_CY_FIRST + i * ROW_CY_PITCH;
  });

  const CREAM_EDGE_INSET_PX = 14;
  const COLUMN_MID_GAP_PX = 12;
  const READY_BASE_SCALE = 1.3;

  /** @typedef {'store' | 'point' | 'uber' | 'fp'} MockSourceKey */

  /** @type {Array<{ source: MockSourceKey, number: string }>} */
  const PREP_SAMPLES = [
    { source: 'store', number: '1985' },
    { source: 'uber', number: 'A7K2Q9' },
    { source: 'point', number: '087' },
    { source: 'fp', number: '640609' },
    { source: 'store', number: '3105' },
    { source: 'point', number: '0412' },
    { source: 'uber', number: 'C7458' },
    { source: 'fp', number: '583920' },
    { source: 'store', number: '1861' },
    { source: 'point', number: '0096' },
  ];

  /** @type {Array<{ source: MockSourceKey, number: string }>} */
  const READY_SAMPLES = [
    { source: 'fp', number: '902114' },
    { source: 'store', number: '2216' },
    { source: 'uber', number: 'K5T7W2' },
    { source: 'point', number: '095' },
    { source: 'store', number: '2217' },
    { source: 'fp', number: '660138' },
    { source: 'uber', number: 'B3R8M9' },
    { source: 'point', number: '0041' },
    { source: 'store', number: '2218' },
    { source: 'fp', number: '481725' },
  ];

  const ZOOM_SAMPLES = [
    { source: 'store', number: '1985', label: '門市（無 icon）' },
    { source: 'point', number: '0412', label: '迷點 / 你訂' },
    { source: 'uber', number: 'A7K2Q9', label: 'Uber Eats' },
    { source: 'fp', number: '640609', label: 'foodpanda' },
  ];

  /**
   * @param {'prep' | 'ready'} zone
   * @returns {Array<{ left: number, width: number, right: number }>}
   */
  function columnRects(zone) {
    const cream = zone === 'ready' ? READY_CREAM : PREP_CREAM;
    const cols = zone === 'ready' ? READY_COL_CX : PREP_COL_CX;
    const midX = (cols[0] + cols[1]) / 2;
    const creamRight = cream.left + cream.width;
    const left0 = cream.left + CREAM_EDGE_INSET_PX;
    const right0 = midX - COLUMN_MID_GAP_PX / 2;
    const left1 = midX + COLUMN_MID_GAP_PX / 2;
    const right1 = creamRight - CREAM_EDGE_INSET_PX;
    return [
      { left: left0, width: right0 - left0, right: right0 },
      { left: left1, width: right1 - left1, right: right1 },
    ];
  }

  /**
   * @param {'prep' | 'ready'} zone
   * @returns {{ left: number, top: number, width: number, height: number, right: number, bottom: number }}
   */
  function creamRect(zone) {
    const cream = zone === 'ready' ? READY_CREAM : PREP_CREAM;
    return {
      left: cream.left,
      top: cream.top,
      width: cream.width,
      height: cream.height,
      right: cream.left + cream.width,
      bottom: cream.top + cream.height,
    };
  }

  root.MilkshaSourceIconMockup = {
    PREP_CREAM: PREP_CREAM,
    READY_CREAM: READY_CREAM,
    PREP_COL_CX: PREP_COL_CX,
    READY_COL_CX: READY_COL_CX,
    ROW_CY: ROW_CY,
    CREAM_EDGE_INSET_PX: CREAM_EDGE_INSET_PX,
    COLUMN_MID_GAP_PX: COLUMN_MID_GAP_PX,
    READY_BASE_SCALE: READY_BASE_SCALE,
    PREP_SAMPLES: PREP_SAMPLES,
    READY_SAMPLES: READY_SAMPLES,
    ZOOM_SAMPLES: ZOOM_SAMPLES,
    columnRects: columnRects,
    creamRect: creamRect,
    cellCenter: function cellCenter(zone, gridIndex) {
      const cols = zone === 'ready' ? READY_COL_CX : PREP_COL_CX;
      const col = gridIndex < 5 ? 0 : 1;
      const row = gridIndex < 5 ? gridIndex : gridIndex - 5;
      return { cx: cols[col], cy: ROW_CY[row], col: col, row: row };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
