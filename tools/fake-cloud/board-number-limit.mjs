/**
 * Cloud board number cap (enforced only on fake-cloud / milksha-cloud, not on controller).
 */
export const MAX_BOARD_PUSH_NUMBERS = 500;

/**
 * After push_numbers is applied, the cloud keeps at most `max` tickets by dropping the oldest.
 * Fake-cloud models oldest as earliest rows in push order (ready[] then preparing[]).
 * TODO-align-with-backend: confirm eviction order against milksha-cloud when readable.
 *
 * @param {unknown[]} tickets
 * @param {number} [max]
 * @returns {unknown[]}
 */
export function trimTicketsToBoardCap(tickets, max = MAX_BOARD_PUSH_NUMBERS) {
  if (!Array.isArray(tickets) || tickets.length <= max) {
    return tickets;
  }
  const drop = tickets.length - max;
  return tickets.slice(drop);
}

export function countPushNumbers(params) {
  if (!params || typeof params !== 'object') {
    return 0;
  }
  const ready = Array.isArray(params.ready) ? params.ready.length : 0;
  const preparing = Array.isArray(params.preparing) ? params.preparing.length : 0;
  return ready + preparing;
}
