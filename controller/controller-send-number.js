/**
 * Quick-send source selection and number validation (reuses board normalizeBoardDisplayNumber).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Controller = QMS.Controller || {};

  /** @type {Array<{ key: string, label: string, preparing: string, ok: string }>} */
  const QUICK_SEND_SOURCE_OPTIONS = [
    { key: 'store', label: '門市', preparing: 'From_Store_Preparing', ok: 'From_Store_OK' },
    { key: 'point', label: '迷點', preparing: 'From_milksha_point_Preparing', ok: 'From_milksha_point_OK' },
    { key: 'uber', label: 'Uber Eats', preparing: 'From_UberEat_Preparing', ok: 'From_UberEat_OK' },
    { key: 'fp', label: 'foodpanda', preparing: 'From_FoodPanda_Preparing', ok: 'From_FoodPanda_OK' },
    { key: 'udd', label: 'Udd', preparing: 'From_Udd_Preparing', ok: 'From_Udd_OK' },
  ];

  const VALIDATION_HINT = {
    store: '門市號碼須為 4 位數字',
    point: '你訂號碼須為 3 位數字',
    fp: 'foodpanda 須為 # 加 4 位數字（例 #6405）',
    uber: 'Uber Eats 須為 5 碼英數（0–9、A–F）',
    udd: 'Udd 號碼須為 4–6 位英數字',
  };

  function sourceOptionForKey(key) {
    for (let i = 0; i < QUICK_SEND_SOURCE_OPTIONS.length; i += 1) {
      if (QUICK_SEND_SOURCE_OPTIONS[i].key === key) {
        return QUICK_SEND_SOURCE_OPTIONS[i];
      }
    }
    return QUICK_SEND_SOURCE_OPTIONS[0];
  }

  function normalizeFn() {
    const MB = QMS.MilkshaBoard;
    return MB && MB.normalizeBoardDisplayNumber ? MB.normalizeBoardDisplayNumber.bind(MB) : null;
  }

  /**
   * @param {string} sourceKey
   * @param {unknown} rawInput
   * @returns {{ ok: true, normalized: string, sourceKey: string } | { ok: false, message: string }}
   */
  function validateQuickSendNumber(sourceKey, rawInput) {
    const key = sourceKey || 'store';
    const hint = VALIDATION_HINT[key] || VALIDATION_HINT.store;
    const raw = rawInput == null ? '' : String(rawInput);
    if (!raw.trim()) {
      return { ok: false, message: '請輸入號碼' };
    }
    const normalize = normalizeFn();
    if (!normalize) {
      return { ok: false, message: '號碼驗證模組未載入' };
    }
    const normalized = normalize(raw, key);
    if (!normalized) {
      return { ok: false, message: hint };
    }
    return { ok: true, normalized: normalized, sourceKey: key };
  }

  QMS.Controller.SendNumber = {
    QUICK_SEND_SOURCE_OPTIONS: QUICK_SEND_SOURCE_OPTIONS,
    DEFAULT_SOURCE_KEY: 'store',
    VALIDATION_HINT: VALIDATION_HINT,
    sourceOptionForKey: sourceOptionForKey,
    validateQuickSendNumber: validateQuickSendNumber,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
