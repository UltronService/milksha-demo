/**
 * POS ticket number → board display (v2: as-sent, trim edges, max 6 display units).
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

  const KNOWN_SOURCE_KEYS = Object.freeze(Object.keys(SOURCE_KEY_TO_CHANNEL));

  const DISPLAY_UNIT_LIMIT = 6;

  /**
   * @param {string} sourceKey
   * @returns {boolean}
   */
  function isKnownSourceKey(sourceKey) {
    return typeof sourceKey === 'string' && SOURCE_KEY_TO_CHANNEL[sourceKey] != null;
  }

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
   * @param {string} raw
   * @returns {string}
   */
  function trimBoardNumberEdges(raw) {
    return String(raw).replace(/^\s+|\s+$/g, '');
  }

  /**
   * STB / old WebView baseline: Unicode code points via ES2015 string iteration (no surrogate splits).
   * @param {string} text
   * @param {number} [maxUnits]
   * @returns {string}
   */
  function truncateToDisplayUnitsByCodePoint(text, maxUnits) {
    const limit = maxUnits == null ? DISPLAY_UNIT_LIMIT : maxUnits;
    if (!text) {
      return '';
    }
    const units = Array.from(String(text));
    return units.slice(0, limit).join('');
  }

  /**
   * @returns {boolean}
   */
  function canUseIntlSegmenter() {
    try {
      return typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function';
    } catch (_e) {
      return false;
    }
  }

  /**
   * Optional grapheme-aware path when Intl.Segmenter exists (feature-detected).
   * @param {string} text
   * @param {number} limit
   * @returns {string}
   */
  function truncateToDisplayUnitsWithSegmenter(text, limit) {
    const seg = new Intl.Segmenter('und', { granularity: 'grapheme' });
    let count = 0;
    let out = '';
    for (const part of seg.segment(text)) {
      if (count >= limit) {
        break;
      }
      out += part.segment;
      count += 1;
    }
    return out;
  }

  /**
   * @param {string} text
   * @param {number} [maxUnits]
   * @returns {string}
   */
  function truncateToDisplayUnits(text, maxUnits) {
    const limit = maxUnits == null ? DISPLAY_UNIT_LIMIT : maxUnits;
    if (!text) {
      return '';
    }
    if (canUseIntlSegmenter()) {
      return truncateToDisplayUnitsWithSegmenter(text, limit);
    }
    return truncateToDisplayUnitsByCodePoint(text, limit);
  }

  /**
   * @param {string} text
   * @returns {string}
   */
  function escapeHtmlText(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * @param {string} channelOrSourceKey
   * @returns {string | null}
   */
  function sourceKeyFromChannelOrKey(channelOrSourceKey) {
    if (typeof channelOrSourceKey !== 'string' || !channelOrSourceKey) {
      return null;
    }
    if (SOURCE_KEY_TO_CHANNEL[channelOrSourceKey]) {
      return channelOrSourceKey;
    }
    const channel = channelOrSourceKey.indexOf('From_') === 0 ? channelOrSourceKey : null;
    if (!channel) {
      return null;
    }
    for (let i = 0; i < KNOWN_SOURCE_KEYS.length; i += 1) {
      const key = KNOWN_SOURCE_KEYS[i];
      if (SOURCE_KEY_TO_CHANNEL[key] === channel) {
        return key;
      }
    }
    return null;
  }

  /**
   * @param {unknown} raw
   * @param {string} channelOrSourceKey source key (store, point, …) or From_* channel
   * @returns {{ dedupeKey: string, display: string } | null}
   */
  function boardNumberFromPos(raw, channelOrSourceKey) {
    if (typeof raw !== 'string') {
      return null;
    }
    const sourceKey = sourceKeyFromChannelOrKey(channelOrSourceKey);
    if (!sourceKey) {
      return null;
    }
    const dedupeKey = trimBoardNumberEdges(raw);
    const display = truncateToDisplayUnits(dedupeKey, DISPLAY_UNIT_LIMIT);
    return { dedupeKey: dedupeKey, display: display };
  }

  /**
   * @param {unknown} raw
   * @param {string} channelOrSourceKey
   * @returns {string | null} display slice for board
   */
  function sanitizePosTicketDisplayNo(raw, channelOrSourceKey) {
    const parsed = boardNumberFromPos(raw, channelOrSourceKey);
    if (!parsed) {
      return null;
    }
    return parsed.display;
  }

  /**
   * @param {unknown} raw
   * @param {string} [sourceKey]
   * @returns {string | null}
   */
  function normalizeForSourceKey(raw, sourceKey) {
    const key = sourceKey || 'store';
    if (typeof key === 'string' && key.indexOf('unk:') === 0) {
      return null;
    }
    return sanitizePosTicketDisplayNo(raw, key);
  }

  /**
   * Duplicate ticket key on board (source channel + trimmed original number).
   * @param {string} channelOrSourceKey
   * @param {string} dedupeKey trimmed original number
   * @returns {string}
   */
  function duplicateKey(channelOrSourceKey, dedupeKey) {
    const channel = resolveChannel(channelOrSourceKey) || String(channelOrSourceKey);
    return channel + String(dedupeKey);
  }

  QMS.Board.PosTicketDisplayNo = {
    SOURCE_KEY_TO_CHANNEL: SOURCE_KEY_TO_CHANNEL,
    KNOWN_SOURCE_KEYS: KNOWN_SOURCE_KEYS,
    DISPLAY_UNIT_LIMIT: DISPLAY_UNIT_LIMIT,
    isKnownSourceKey: isKnownSourceKey,
    channelFromSourceType: channelFromSourceType,
    trimBoardNumberEdges: trimBoardNumberEdges,
    truncateToDisplayUnits: truncateToDisplayUnits,
    truncateToDisplayUnitsByCodePoint: truncateToDisplayUnitsByCodePoint,
    canUseIntlSegmenter: canUseIntlSegmenter,
    escapeHtmlText: escapeHtmlText,
    boardNumberFromPos: boardNumberFromPos,
    sanitizePosTicketDisplayNo: sanitizePosTicketDisplayNo,
    normalizeForSourceKey: normalizeForSourceKey,
    duplicateKey: duplicateKey,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
