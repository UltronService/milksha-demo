/**
 * Store id format validation (board URL + cloud APIs).
 * One lowercase letter + 2 or 6 digits, known literals, zz-qa-* / zz-deny-* QA stores.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});

  const KNOWN_LITERAL_STORE_IDS = new Set(['s120030', 'c030020', 'a17']);
  const STORE_ID_ZZ_QA_RE = /^zz-qa-[a-z0-9-]+$/;
  const STORE_ID_ZZ_DENY_RE = /^zz-deny-[a-z0-9-]+$/;
  const STORE_ID_LETTER_SIX_DIGITS_RE = /^[a-z][0-9]{6}$/;

  /**
   * @param {string} storeId
   * @returns {boolean}
   */
  function isValidStoreIdFormat(storeId) {
    const id = String(storeId || '').trim();
    if (!id) {
      return false;
    }
    if (KNOWN_LITERAL_STORE_IDS.has(id)) {
      return true;
    }
    if (STORE_ID_ZZ_QA_RE.test(id)) {
      return true;
    }
    if (STORE_ID_ZZ_DENY_RE.test(id)) {
      return true;
    }
    if (STORE_ID_LETTER_SIX_DIGITS_RE.test(id)) {
      return true;
    }
    return false;
  }

  QMS.StoreId = {
    isValidStoreIdFormat: isValidStoreIdFormat,
    KNOWN_LITERAL_STORE_IDS: KNOWN_LITERAL_STORE_IDS,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
