/** Reference-board numbers for art QA — prep and ready must differ (ready wins on overlap). */
export const REF_BOARD_NUMBERS_PREP = [
  '2907',
  '2906',
  '2905',
  '2904',
  '2903',
  '2902',
  '2901',
  '2900',
  '2899',
  '2898',
];

export const REF_BOARD_NUMBERS_READY = [
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

/** @deprecated use REF_BOARD_NUMBERS_READY */
export const REF_BOARD_NUMBERS = REF_BOARD_NUMBERS_READY;

/**
 * @returns {Array<{ source_type: string, number: string }>}
 */
export function buildRefBoardPayload() {
  const prep = REF_BOARD_NUMBERS_PREP.map((number) => ({
    source_type: 'From_milksha_point_Preparing',
    number,
  }));
  const ready = REF_BOARD_NUMBERS_READY.map((number) => ({
    source_type: 'From_Store_OK',
    number,
  }));
  return [...prep, ...ready];
}
