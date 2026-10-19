const STORE_ID_ZZ_QA_RE = /^zz-qa-[a-z0-9-]+$/;
const STORE_ID_ZZ_DENY_RE = /^zz-deny-[a-z0-9-]+$/;
const STORE_ID_LETTER_TWO_DIGITS_RE = /^[a-z][0-9]{2}$/;
const STORE_ID_LETTER_SIX_DIGITS_RE = /^[a-z][0-9]{6}$/;

/**
 * @param {unknown} storeId
 * @returns {string}
 */
export function normalizeStoreId(storeId) {
  return String(storeId || '').trim().toLowerCase();
}

/**
 * Valid: 1 letter + 2 digits, 1 letter + 6 digits, or zz-qa-* / zz-deny-* (lowercase).
 * @param {unknown} storeId
 * @returns {boolean}
 */
export function isValidStoreIdFormat(storeId) {
  const id = normalizeStoreId(storeId);
  if (!id) {
    return false;
  }
  if (STORE_ID_ZZ_QA_RE.test(id)) {
    return true;
  }
  if (STORE_ID_ZZ_DENY_RE.test(id)) {
    return true;
  }
  if (STORE_ID_LETTER_TWO_DIGITS_RE.test(id)) {
    return true;
  }
  if (STORE_ID_LETTER_SIX_DIGITS_RE.test(id)) {
    return true;
  }
  return false;
}

export const STORE_ID_PATTERNS = {
  STORE_ID_ZZ_QA_RE,
  STORE_ID_ZZ_DENY_RE,
  STORE_ID_LETTER_TWO_DIGITS_RE,
  STORE_ID_LETTER_SIX_DIGITS_RE,
};
