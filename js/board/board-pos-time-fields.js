/**
 * Cloud/POS timestamp field names on tickets and number_content rows.
 * Rename here only when backend contract changes.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Board = QMS.Board || {};

  /** @type {Readonly<Record<string, string>>} */
  const BOARD_POS_TIME_FIELD = {
    firstSeenPosAtMs: 'firstSeenPosAtMs',
    readyPosAtMs: 'readyPosAtMs',
    posTimeSource: 'posTimeSource',
    seqInBatch: 'seqInBatch',
    readySeqInBatch: 'readySeqInBatch',
  };

  const FIELD_KEYS = Object.keys(BOARD_POS_TIME_FIELD);

  /**
   * @param {unknown} value
   * @returns {number | null}
   */
  function parsePosTimeMs(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || value <= 0) {
        return null;
      }
      return value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const asNum = Number(trimmed);
      if (Number.isFinite(asNum) && asNum > 0) {
        return asNum;
      }
      const parsed = Date.parse(trimmed);
      if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed;
      }
      return null;
    }
    return null;
  }

  /**
   * @param {object | null | undefined} source
   * @param {object} target
   */
  function copyPosTimeFields(source, target) {
    if (!source || typeof source !== 'object' || !target || typeof target !== 'object') {
      return;
    }
    for (let i = 0; i < FIELD_KEYS.length; i += 1) {
      const key = BOARD_POS_TIME_FIELD[FIELD_KEYS[i]];
      if (source[key] !== undefined && source[key] !== null) {
        target[key] = source[key];
      }
    }
    if (typeof source.updatedAt === 'string' && source.updatedAt) {
      target.updatedAt = source.updatedAt;
    }
  }

  /**
   * @param {object | null | undefined} row
   * @returns {boolean}
   */
  function rowHasAnyPosTimeField(row) {
    if (!row || typeof row !== 'object') {
      return false;
    }
    if (parsePosTimeMs(row[BOARD_POS_TIME_FIELD.firstSeenPosAtMs]) != null) {
      return true;
    }
    if (parsePosTimeMs(row[BOARD_POS_TIME_FIELD.readyPosAtMs]) != null) {
      return true;
    }
    if (Number.isFinite(row[BOARD_POS_TIME_FIELD.seqInBatch])) {
      return true;
    }
    if (Number.isFinite(row[BOARD_POS_TIME_FIELD.readySeqInBatch])) {
      return true;
    }
    return false;
  }

  QMS.Board.PosTimeFields = {
    BOARD_POS_TIME_FIELD: BOARD_POS_TIME_FIELD,
    FIELD_KEYS: FIELD_KEYS,
    parsePosTimeMs: parsePosTimeMs,
    copyPosTimeFields: copyPosTimeFields,
    rowHasAnyPosTimeField: rowHasAnyPosTimeField,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
