/**
 * Cloud board number cap (enforced only on fake-cloud / milksha-cloud, not on controller).
 */
export const MAX_BOARD_PUSH_NUMBERS = 500;

/** TODO-align-with-backend: must match milksha-cloud devCommand rejection code when PR lands */
export const API_ERROR_TOO_MANY_BOARD_NUMBERS = 'too_many_board_numbers';

export function countPushNumbers(params) {
  if (!params || typeof params !== 'object') {
    return 0;
  }
  const ready = Array.isArray(params.ready) ? params.ready.length : 0;
  const preparing = Array.isArray(params.preparing) ? params.preparing.length : 0;
  return ready + preparing;
}
