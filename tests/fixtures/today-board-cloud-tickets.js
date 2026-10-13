'use strict';

/**
 * Fake `today_board.tickets[]` (milksha-cloud PR #22, pre-deploy).
 * `no` is cloud-normalized; foodpanda already without `#`.
 * Missing `sourceType` → board treats as store.
 */
const CLOUD_DELIVERY_SAMPLE_TICKETS = [
  {
    no: '578',
    status: 'ready',
    sourceType: 'From_milksha_point_OK',
    updatedAt: '2026-10-12T22:00:00.000Z',
  },
  {
    no: 'C7458',
    status: 'ready',
    sourceType: 'From_UberEat_OK',
    updatedAt: '2026-10-12T22:00:01.000Z',
  },
  {
    no: '6406',
    status: 'ready',
    sourceType: 'From_FoodPanda_OK',
    updatedAt: '2026-10-12T22:00:02.000Z',
  },
  {
    no: '7112',
    status: 'ready',
    updatedAt: '2026-10-12T22:00:03.000Z',
  },
];

module.exports = { CLOUD_DELIVERY_SAMPLE_TICKETS };
