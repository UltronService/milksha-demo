/**
 * Aligns with milksha-cloud functions/src/lib/pos-ticket-channel.ts sanitizePosTicketDisplayNo.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Board = QMS.Board || {};

  /** @type {Readonly<Record<string, string>>} */
  const SOURCE_KEY_TO_CHANNEL = Object.freeze({
    store: 'From_Store',
    point: 'From_milksha_point',
    uber: 'From_UberEat',
    fp: 'From_FoodPanda',
    udd: 'From_Udd',
  });

  /**
   * @param {string} sourceType
   * @returns {string | null}
   */
  function channelFromSourceType(sourceType) {
    if (typeof sourceType !== 'string' || !sourceType) {
      return null;
    }
    return sourceType.replace(/_(Preparing|OK|Cancelled)$/i, '');
  }

  /**
   * @param {string} channelOrSourceKey
   * @returns {string | null}
   */
  function resolveChannel(channelOrSourceKey) {
    const key = channelOrSourceKey || 'store';
    if (SOURCE_KEY_TO_CHANNEL[key]) {
      return SOURCE_KEY_TO_CHANNEL[key];
    }
    if (key.indexOf('From_') === 0) {
      return channelFromSourceType(key);
    }
    return null;
  }

  /**
   * @param {unknown} raw
   * @param {string} channelOrSourceKey source key (store, point, …) or From_* channel
   * @returns {string | null} display value for board / push
   */
  function sanitizePosTicketDisplayNo(raw, channelOrSourceKey) {
    if (typeof raw !== 'string') {
      return null;
    }
    const channel = resolveChannel(channelOrSourceKey);
    if (!channel) {
      return null;
    }
    if (channel === 'From_Store') {
      return /^[0-9]{4}$/.test(raw) ? raw : null;
    }
    if (channel === 'From_milksha_point') {
      return /^[0-9]{3}$/.test(raw) ? raw : null;
    }
    if (channel === 'From_Udd') {
      return /^[0-9]{4}$/.test(raw) ? raw : null;
    }
    if (channel === 'From_UberEat') {
      const upper = raw.trim().toUpperCase();
      return /^[0-9A-F]{5}$/.test(upper) ? upper : null;
    }
    if (channel === 'From_FoodPanda') {
      const trimmed = raw.trim();
      return /^#[0-9]{4}$/.test(trimmed) ? trimmed : null;
    }
    let working = raw;
    if (working.charAt(0) === '#') {
      working = working.slice(1);
    }
    const upper = working.trim().toUpperCase();
    if (!/^[0-9A-Z]{3,6}$/.test(upper)) {
      return null;
    }
    return upper;
  }

  /**
   * @param {unknown} raw
   * @param {string} [sourceKey]
   * @returns {string | null}
   */
  function normalizeForSourceKey(raw, sourceKey) {
    const key = sourceKey || 'store';
    const channel = SOURCE_KEY_TO_CHANNEL[key];
    if (!channel) {
      return sanitizePosTicketDisplayNo(raw, key);
    }
    return sanitizePosTicketDisplayNo(raw, channel);
  }

  /**
   * Duplicate ticket key on board (cloud: channel + display number).
   * @param {string} channelOrSourceKey
   * @param {string} displayNo
   * @returns {string}
   */
  function duplicateKey(channelOrSourceKey, displayNo) {
    const channel = resolveChannel(channelOrSourceKey) || String(channelOrSourceKey);
    return channel + String(displayNo);
  }

  QMS.Board.PosTicketDisplayNo = {
    SOURCE_KEY_TO_CHANNEL: SOURCE_KEY_TO_CHANNEL,
    channelFromSourceType: channelFromSourceType,
    sanitizePosTicketDisplayNo: sanitizePosTicketDisplayNo,
    normalizeForSourceKey: normalizeForSourceKey,
    duplicateKey: duplicateKey,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
