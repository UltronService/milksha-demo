/**
 * Bounded per-storeId reported-ticket set (survives STB page reopen; localStorage).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Board = QMS.Board || {};

  const STORAGE_KEY_PREFIX = 'milksha:box-seen-reported:v2:';
  const LEGACY_KEY_PREFIX = 'milksha:box-seen-reported:v1:';
  const DEFAULT_MAX_ENTRIES = 500;

  /**
   * @param {string} ticketNo
   * @param {string} intakeLogId
   * @returns {string}
   */
  function entryKey(ticketNo, intakeLogId) {
    return String(intakeLogId) + '\u001f' + String(ticketNo);
  }

  /**
   * @param {string} storeId
   * @returns {string}
   */
  function storageKey(storeId) {
    return STORAGE_KEY_PREFIX + String(storeId);
  }

  /**
   * @param {Storage | null} storage
   * @param {string} storeId
   * @returns {{ order: string[], set: Record<string, true> }}
   */
  function loadState(storage, storeId) {
    const empty = { order: [], set: {} };
    if (!storage) {
      return empty;
    }
    try {
      const raw = storage.getItem(storageKey(storeId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.order) && parsed.set && typeof parsed.set === 'object') {
          return { order: parsed.order.slice(), set: Object.assign({}, parsed.set) };
        }
      }
    } catch (e) {
      /* ignore */
    }
    importLegacyV1(storage, storeId, empty);
    return empty;
  }

  /**
   * @param {Storage | null} storage
   * @param {string} storeId
   * @param {{ order: string[], set: Record<string, true> }} state
   */
  function importLegacyV1(storage, storeId, state) {
    if (!storage || state.order.length > 0) {
      return;
    }
    try {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key || key.indexOf(LEGACY_KEY_PREFIX) !== 0) {
          continue;
        }
        const suffix = key.slice(LEGACY_KEY_PREFIX.length);
        if (suffix.indexOf(storeId + ':') !== 0) {
          continue;
        }
        const raw = storage.getItem(key);
        if (!raw) {
          continue;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
          continue;
        }
        const keys = Object.keys(parsed);
        for (let j = 0; j < keys.length; j += 1) {
          const k = keys[j];
          if (parsed[k]) {
            state.set[k] = true;
            state.order.push(k);
          }
        }
      }
    } catch (e) {
      /* ignore */
    }
  }

  /**
   * @param {Storage | null} storage
   * @param {string} storeId
   * @param {{ order: string[], set: Record<string, true> }} state
   */
  function saveState(storage, storeId, state) {
    if (!storage) {
      return;
    }
    try {
      storage.setItem(
        storageKey(storeId),
        JSON.stringify({ order: state.order, set: state.set }),
      );
    } catch (e) {
      /* ignore */
    }
  }

  /**
   * @param {{ storage?: Storage | null, storeId: string, maxEntries?: number }} opts
   */
  function createReportedTicketStore(opts) {
    const storeId = String(opts.storeId || '');
    const storage = opts.storage != null ? opts.storage : root.localStorage || null;
    const maxEntries =
      opts.maxEntries != null && Number.isFinite(Number(opts.maxEntries))
        ? Number(opts.maxEntries)
        : DEFAULT_MAX_ENTRIES;
    const state = loadState(storage, storeId);

    function trim() {
      while (state.order.length > maxEntries) {
        const oldest = state.order.shift();
        if (oldest) {
          delete state.set[oldest];
        }
      }
    }

    function hasReported(ticketNo, intakeLogId) {
      return Boolean(state.set[entryKey(ticketNo, intakeLogId)]);
    }

    function markReported(ticketNo, intakeLogId) {
      const key = entryKey(ticketNo, intakeLogId);
      if (state.set[key]) {
        return;
      }
      state.set[key] = true;
      state.order.push(key);
      trim();
      saveState(storage, storeId, state);
    }

    function count() {
      return state.order.length;
    }

    return {
      hasReported: hasReported,
      markReported: markReported,
      count: count,
    };
  }

  QMS.Board.createReportedTicketStore = createReportedTicketStore;
  QMS.Board._boxSeenReportedEntryKey = entryKey;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
