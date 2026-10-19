/**
 * Quick-send source selection, defaults, rule notes, and number preparation (v2: as-typed).
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
    point: '012',
    uber: 'c7458',
    fp: '#130',
    udd: '0012',
  };

  /** @type {Record<string, string>} */
  const RULE_NOTE = {
    store: '原樣送出；看板最多顯示 6 字',
    point: '原樣送出；看板最多顯示 6 字',
    fp: '原樣送出；看板最多顯示 6 字',
    uber: '原樣送出；看板最多顯示 6 字',
    udd: '原樣送出；看板最多顯示 6 字',
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

  function posTicketModule() {
    return QMS.Board && QMS.Board.PosTicketDisplayNo ? QMS.Board.PosTicketDisplayNo : null;
  }

  /**
   * Board dedupe key for duplicate-on-board checks (trim edges only).
   * @param {unknown} rawInput
   * @returns {string}
   */
  function boardDedupeKeyFromRaw(rawInput) {
    const mod = posTicketModule();
    const raw = rawInput == null ? '' : String(rawInput);
    if (mod && mod.trimBoardNumberEdges) {
      return mod.trimBoardNumberEdges(raw);
    }
    return raw.replace(/^\s+|\s+$/g, '');
  }

  /**
   * @param {string} sourceKey
   * @param {unknown} rawInput
   * @returns {{ ok: true, normalized: string, sourceKey: string } | { ok: false, message: string }}
   */
  function validateQuickSendNumber(sourceKey, rawInput) {
    const key = sourceKey || DEFAULT_SOURCE_KEY;
    const mod = posTicketModule();
    if (!mod || !mod.isKnownSourceKey || !mod.isKnownSourceKey(key)) {
      return { ok: false, message: '未知來源' };
    }
    const normalized = rawInput == null ? '' : String(rawInput);
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
    if (!validated.ok) {
      return {
        valid: false,
        ruleNoteText: '',
        errorText: validated.message,
        inputInvalid: true,
        sendDisabled: true,
      };
    }
    return {
      valid: true,
      ruleNoteText: normalNote,
      errorText: '',
      inputInvalid: false,
      sendDisabled: false,
    };
  }

  const DEFAULT_SOURCE_KEY = 'store';

  QMS.Controller.SendNumber = {
    QUICK_SEND_SOURCE_OPTIONS: QUICK_SEND_SOURCE_OPTIONS,
    DEFAULT_SOURCE_KEY: DEFAULT_SOURCE_KEY,
    DEFAULT_QUICK_SEND_NUMBER: DEFAULT_QUICK_SEND_NUMBER,
    RULE_NOTE: RULE_NOTE,
    DUPLICATE_ON_BOARD_MESSAGE: DUPLICATE_ON_BOARD_MESSAGE,
    sourceOptionForKey: sourceOptionForKey,
    defaultQuickSendNumber: defaultQuickSendNumber,
    ruleNoteForSource: ruleNoteForSource,
    boardDedupeKeyFromRaw: boardDedupeKeyFromRaw,
    validateQuickSendNumber: validateQuickSendNumber,
    resolveQuickSendValueOnSourceChange: resolveQuickSendValueOnSourceChange,
    buildQuickSendFieldPresentation: buildQuickSendFieldPresentation,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
