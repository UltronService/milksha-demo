'use strict';

const STORE_ID = 'zz-qa-pos-time-a';

const T0 = 1_730_000_000_000;
const T1 = T0 + 60_000;
const T2 = T0 + 120_000;
const T3 = T0 + 180_000;

/**
 * @param {string} no
 * @param {'preparing'|'ready'} status
 * @param {object} [pos]
 * @returns {object}
 */
function ticket(no, status, pos) {
  const row = {
    no: no,
    status: status,
    updatedAt: '2026-10-20T08:00:00.000Z',
    sourceType:
      status === 'ready' ? 'From_Store_OK' : 'From_Store_Preparing',
    posTimeSource: 'pos',
  };
  if (pos && typeof pos === 'object') {
    Object.assign(row, pos);
  }
  return row;
}

/** Preparing newest-first by firstSeenPosAtMs: 3003, 3002, 3001 */
const PREPARING_POS_SORT_TICKETS = [
  ticket('3001', 'preparing', { firstSeenPosAtMs: T0, seqInBatch: 0 }),
  ticket('3002', 'preparing', { firstSeenPosAtMs: T1, seqInBatch: 1 }),
  ticket('3003', 'preparing', { firstSeenPosAtMs: T2, seqInBatch: 2 }),
];

/** Ready newest-first by readyPosAtMs */
const READY_POS_SORT_TICKETS = [
  ticket('4001', 'ready', { firstSeenPosAtMs: T0, readyPosAtMs: T0, readySeqInBatch: 0 }),
  ticket('4002', 'ready', { firstSeenPosAtMs: T0, readyPosAtMs: T2, readySeqInBatch: 1 }),
  ticket('4003', 'ready', { firstSeenPosAtMs: T0, readyPosAtMs: T3, readySeqInBatch: 2 }),
];

/** Same readyPosAtMs — seq then number */
const READY_TIE_SEQ_TICKETS = [
  ticket('5002', 'ready', { readyPosAtMs: T2, readySeqInBatch: 1, firstSeenPosAtMs: T0 }),
  ticket('5001', 'ready', { readyPosAtMs: T2, readySeqInBatch: 0, firstSeenPosAtMs: T0 }),
  ticket('5010', 'ready', { readyPosAtMs: T2, readySeqInBatch: 0, firstSeenPosAtMs: T0 }),
];

const MIXED_DELIVERY_TICKETS = [
  ticket('578', 'ready', {
    sourceType: 'From_milksha_point_OK',
    readyPosAtMs: T2,
    readySeqInBatch: 0,
    firstSeenPosAtMs: T0,
  }),
  ticket('7112', 'ready', {
    readyPosAtMs: T2,
    readySeqInBatch: 1,
    firstSeenPosAtMs: T1,
  }),
];

module.exports = {
  STORE_ID,
  T0,
  T1,
  T2,
  T3,
  ticket,
  PREPARING_POS_SORT_TICKETS,
  READY_POS_SORT_TICKETS,
  READY_TIE_SEQ_TICKETS,
  MIXED_DELIVERY_TICKETS,
};
