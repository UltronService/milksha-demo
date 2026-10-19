/**
 * Cloud board number cap (enforced only on fake-cloud / milksha-cloud, not on controller).
 */
export const MAX_BOARD_PUSH_NUMBERS = 500;

/**
 * milksha-cloud PR #38: never reject >500; keep the newest numbers in send order.
 * Combined list order is ready[] then preparing[] as built from push_numbers params.
 * A single push with >500 entries keeps the last `max` rows (drops earliest-entered).
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
