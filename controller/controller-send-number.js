/**
 * Quick-send source selection, defaults, rule notes, and number validation.
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

  /** @type {Record<string, string>} */
  const DEFAULT_QUICK_SEND_NUMBER = {
    store: '2001',
    point: '091',
    uber: 'C7458',
    fp: '6405',
    udd: '1234',
  };

  /** @type {Record<string, string>} */
  const RULE_NOTE = {
    store: '4 位數字',
    point: '3–4 位數字',
    fp: '4–6 位數字，# 可有可無',
    uber: '4–6 位英數字',
    udd: '4–6 位英數字',
  };

  const VALIDATION_HINT = {
    store: '門市號碼須為 4 位數字',
    point: '迷點號碼須為 3–4 位數字',
    fp: 'foodpanda 號碼須為 4–6 位數字',
    uber: 'Uber Eats 號碼須為 4–6 位英數字',
    udd: 'Udd 號碼須為 4–6 位英數字',
  };

  const DUPLICATE_ON_BOARD_MESSAGE = '此號碼已在看板上';

  function sourceOptionForKey(key) {
    for (let i = 0; i < QUICK_SEND_SOURCE_OPTIONS.length; i += 1) {
      if (QUICK_SEND_SOURCE_OPTIONS[i].key === key) {
        return QUICK_SEND_SOURCE_OPTIONS[i];
      }
    }
    return QUICK_SEND_SOURCE_OPTIONS[0];
  }

  function defaultQuickSendNumber(sourceKey) {
    const key = sourceKey || DEFAULT_SOURCE_KEY;
    return DEFAULT_QUICK_SEND_NUMBER[key] || DEFAULT_QUICK_SEND_NUMBER.store;
  }

  function ruleNoteForSource(sourceKey) {
    const key = sourceKey || DEFAULT_SOURCE_KEY;
    return RULE_NOTE[key] || RULE_NOTE.store;
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
    const key = sourceKey || DEFAULT_SOURCE_KEY;
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
    if (key === 'fp' && normalized.length < 4) {
      return { ok: false, message: VALIDATION_HINT.fp };
    }
    if ((key === 'uber' || key === 'udd') && normalized.length < 4) {
      return { ok: false, message: VALIDATION_HINT[key] };
    }
    return { ok: true, normalized: normalized, sourceKey: key };
  }

  /**
   * @param {{ previousSourceKey: string, newSourceKey: string, currentValue: string, pristine: boolean }} input
   * @returns {{ nextValue: string, selectAll: boolean, pristine: boolean }}
   */
  function resolveQuickSendValueOnSourceChange(input) {
    const previousKey = input.previousSourceKey || DEFAULT_SOURCE_KEY;
    const newKey = input.newSourceKey || DEFAULT_SOURCE_KEY;
    const current = input.currentValue == null ? '' : String(input.currentValue);
    if (!input.pristine) {
      return { nextValue: current, selectAll: false, pristine: false };
    }
    const nextValue = defaultQuickSendNumber(newKey);
    return { nextValue: nextValue, selectAll: true, pristine: true };
  }

  /**
   * @param {{ sourceKey: string, rawValue: string, duplicateOnBoard?: boolean }} input
   * @returns {{
   *   valid: boolean,
   *   ruleNoteText: string,
   *   errorText: string,
   *   inputInvalid: boolean,
   *   sendDisabled: boolean
   * }}
   */
  function buildQuickSendFieldPresentation(input) {
    const sourceKey = input.sourceKey || DEFAULT_SOURCE_KEY;
    const normalNote = ruleNoteForSource(sourceKey);
    if (input.duplicateOnBoard) {
      return {
        valid: false,
        ruleNoteText: '',
        errorText: DUPLICATE_ON_BOARD_MESSAGE,
        inputInvalid: true,
        sendDisabled: true,
      };
    }
    const validated = validateQuickSendNumber(sourceKey, input.rawValue);
    if (validated.ok) {
      return {
        valid: true,
        ruleNoteText: normalNote,
        errorText: '',
        inputInvalid: false,
        sendDisabled: false,
      };
    }
    return {
      valid: false,
      ruleNoteText: '',
      errorText: validated.message,
      inputInvalid: true,
      sendDisabled: true,
    };
  }

  const DEFAULT_SOURCE_KEY = 'store';

  QMS.Controller.SendNumber = {
    QUICK_SEND_SOURCE_OPTIONS: QUICK_SEND_SOURCE_OPTIONS,
    DEFAULT_SOURCE_KEY: DEFAULT_SOURCE_KEY,
    DEFAULT_QUICK_SEND_NUMBER: DEFAULT_QUICK_SEND_NUMBER,
    RULE_NOTE: RULE_NOTE,
    VALIDATION_HINT: VALIDATION_HINT,
    DUPLICATE_ON_BOARD_MESSAGE: DUPLICATE_ON_BOARD_MESSAGE,
    sourceOptionForKey: sourceOptionForKey,
    defaultQuickSendNumber: defaultQuickSendNumber,
    ruleNoteForSource: ruleNoteForSource,
    validateQuickSendNumber: validateQuickSendNumber,
    resolveQuickSendValueOnSourceChange: resolveQuickSendValueOnSourceChange,
    buildQuickSendFieldPresentation: buildQuickSendFieldPresentation,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
