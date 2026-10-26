/** Reference-board numbers for art QA — prep and ready must differ (ready wins on overlap). */
/** Point (迷點) preparing numbers must be 3 digits per normalizeBoardDisplayNumber. */
export const REF_BOARD_NUMBERS_PREP = [
  '907',
  '906',
  '905',
  '904',
  '903',
  '902',
  '901',
  '900',
  '899',
  '898',
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
