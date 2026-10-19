/**
 * Store id normalization and format validation (aligned with PR #105 js/shared/store-id.js).
 * Valid: 1 lowercase letter + 2 or 6 digits, or zz-qa-* / zz-deny-*.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});

  const STORE_ID_ZZ_QA_RE = /^zz-qa-[a-z0-9-]+$/;
  const STORE_ID_ZZ_DENY_RE = /^zz-deny-[a-z0-9-]+$/;
  const STORE_ID_LETTER_TWO_DIGITS_RE = /^[a-z][0-9]{2}$/;
  const STORE_ID_LETTER_SIX_DIGITS_RE = /^[a-z][0-9]{6}$/;

  /**
   * @param {unknown} storeId
   * @returns {string}
   */
  function normalizeStoreId(storeId) {
    return String(storeId || '').trim().toLowerCase();
  }

  /**
   * @param {unknown} storeId
   * @returns {boolean}
   */
  function isValidStoreIdFormat(storeId) {
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

  QMS.StoreId = {
    normalizeStoreId: normalizeStoreId,
    isValidStoreIdFormat: isValidStoreIdFormat,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
