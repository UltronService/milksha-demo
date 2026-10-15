/**
 * Static sample rows for source-icon mockups only (not loaded by production board).
 */
(function (root) {
  'use strict';

  const PREP_COL_CX = [331.15, 727.91];
  const READY_COL_CX = [1248.4, 1645.31];
  const ROW_CY_FIRST = 438.4425;
  const ROW_CY_PITCH = 110.4075;
  const ROW_CY = [0, 1, 2, 3, 4].map(function (i) {
    return ROW_CY_FIRST + i * ROW_CY_PITCH;
  });

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

  root.MilkshaSourceIconMockup = {
    PREP_COL_CX: PREP_COL_CX,
    READY_COL_CX: READY_COL_CX,
    ROW_CY: ROW_CY,
    PREP_SAMPLES: PREP_SAMPLES,
    READY_SAMPLES: READY_SAMPLES,
    ZOOM_SAMPLES: ZOOM_SAMPLES,
    cellCenter: function cellCenter(zone, gridIndex) {
      const cols = zone === 'ready' ? READY_COL_CX : PREP_COL_CX;
      const col = gridIndex < 5 ? 0 : 1;
      const row = gridIndex < 5 ? gridIndex : gridIndex - 5;
      return { cx: cols[col], cy: ROW_CY[row] };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
