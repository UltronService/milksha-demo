/**
 * Static sample rows for source-icon mockups only (not loaded by production board).
 */
(function (root) {
  'use strict';

  /** @type {{ prep: object, ready: object }} — from pixel scan; see source-icons-cream-bounds.json */
  const CREAM_PIXEL = {
    prep: { left: 101, top: 341, right: 899, bottom: 979 },
    ready: { left: 1020, top: 340, right: 1819, bottom: 979 },
  };

  const ROW_CY_FIRST = 438.4425;
  const ROW_CY_PITCH = 110.4075;
  const ROW_CY = [0, 1, 2, 3, 4].map(function (i) {
    return ROW_CY_FIRST + i * ROW_CY_PITCH;
  });

  const CREAM_EDGE_INSET_PX = 12;
  const COLUMN_MID_GAP_PX = 10;

  /** @typedef {'store' | 'point' | 'uber' | 'fp'} MockSourceKey */

  /**
   * Sample rows (mock only). After `partitionNumberContent` + live sort, the **last** row in each
   * array is the newest and appears at grid index 0 (top-left); fill order uses production
   * `layoutPageGrid` (left column rows 0–4, then right column).
   */

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
    { source: 'fp', number: '640609', label: 'foodpanda (#640609)' },
  ];

  /**
   * @param {'prep' | 'ready'} zone
   * @returns {{ left: number, top: number, right: number, bottom: number, width: number, height: number }}
   */
  function creamRectPixel(zone) {
    const c = zone === 'ready' ? CREAM_PIXEL.ready : CREAM_PIXEL.prep;
    return {
      left: c.left,
      top: c.top,
      right: c.right,
      bottom: c.bottom,
      width: c.right - c.left + 1,
      height: c.bottom - c.top + 1,
    };
  }

  /**
   * @param {'prep' | 'ready'} zone
   * @returns {Array<{ left: number, width: number, right: number }>}
   */
  function columnRects(zone) {
    const cream = creamRectPixel(zone);
    const midX = (cream.left + cream.right) / 2;
    const left0 = cream.left + CREAM_EDGE_INSET_PX;
    const right0 = midX - COLUMN_MID_GAP_PX / 2;
    const left1 = midX + COLUMN_MID_GAP_PX / 2;
    const right1 = cream.right - CREAM_EDGE_INSET_PX;
    return [
      { left: left0, width: right0 - left0, right: right0 },
      { left: left1, width: right1 - left1, right: right1 },
    ];
  }

  /** Owner mock spec: show `#` + up to 6 digits (production still strips `#` today). */
  const FP_WORST_CASE_DISPLAY = '#999999';

  /**
   * @param {string} digits — payload / board id digits (no `#`)
   * @returns {string}
   */
  function formatFoodpandaMockDisplay(digits) {
    const body = String(digits || '').replace(/^#+/, '').slice(0, 6);
    return body ? '#' + body : '#';
  }

  const SOURCE_PREFIX = {
    store: 'From_Store',
    point: 'From_milksha_point',
    uber: 'From_UberEat',
    fp: 'From_FoodPanda',
  };

  /**
   * @param {MockSourceKey} source
   * @param {'preparing' | 'ready'} status
   * @returns {string}
   */
  function sourceTypeFor(source, status) {
    const prefix = SOURCE_PREFIX[source];
    if (!prefix) {
      return 'From_Store_' + (status === 'ready' ? 'OK' : 'Preparing');
    }
    return prefix + (status === 'ready' ? '_OK' : '_Preparing');
  }

  /**
   * @returns {Array<{ source_type: string, number: string }>}
   */
  function buildPayload() {
    const out = [];
    PREP_SAMPLES.forEach(function (row) {
      out.push({
        source_type: sourceTypeFor(row.source, 'preparing'),
        number: row.number,
      });
    });
    READY_SAMPLES.forEach(function (row) {
      out.push({
        source_type: sourceTypeFor(row.source, 'ready'),
        number: row.number,
      });
    });
    return out;
  }

  root.MilkshaSourceIconMockup = {
    CREAM_PIXEL: CREAM_PIXEL,
    ROW_CY: ROW_CY,
    CREAM_EDGE_INSET_PX: CREAM_EDGE_INSET_PX,
    COLUMN_MID_GAP_PX: COLUMN_MID_GAP_PX,
    PREP_SAMPLES: PREP_SAMPLES,
    READY_SAMPLES: READY_SAMPLES,
    ZOOM_SAMPLES: ZOOM_SAMPLES,
    creamRectPixel: creamRectPixel,
    columnRects: columnRects,
    cellCenter: function cellCenter(zone, gridIndex) {
      const col = gridIndex < 5 ? 0 : 1;
      const row = gridIndex < 5 ? gridIndex : gridIndex - 5;
      return { cy: ROW_CY[row], col: col, row: row };
    },
    buildPayload: buildPayload,
    sourceTypeFor: sourceTypeFor,
    FP_WORST_CASE_DISPLAY: FP_WORST_CASE_DISPLAY,
    formatFoodpandaMockDisplay: formatFoodpandaMockDisplay,
  };
})(typeof window !== 'undefined' ? window : globalThis);
