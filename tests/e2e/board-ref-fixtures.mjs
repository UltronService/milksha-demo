/** Shared reference-board numbers for art QA (both zones). */
export const REF_BOARD_NUMBERS = [
  '1907',
  '1906',
  '1905',
  '1904',
  '1903',
  '1902',
  '1901',
  '1900',
  '1899',
  '1898',
];

/**
 * @returns {Array<{ source_type: string, number: string }>}
 */
export function buildRefBoardPayload() {
  const prep = REF_BOARD_NUMBERS.map((number) => ({
    source_type: 'From_milksha_point_Preparing',
    number,
  }));
  const ready = REF_BOARD_NUMBERS.map((number) => ({
    source_type: 'From_Store_OK',
    number,
  }));
  return [...prep, ...ready];
}
