/**
 * Board auto-pair (bind) — pure logic: storage, hint visibility, formatting.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Board = QMS.Board || {};

  const STORAGE_MACHINE_ID = 'milksha:board-machine-id';
  const STORAGE_BIND_RECORD = 'milksha:board-bind-record';
  const STORAGE_HINT_EVER = 'milksha:board-bind-hint-ever';
  const SESSION_HINT_ACTIVE = 'milksha:board-bind-hint-session';

  const MIN_YEAR_FOR_CLOCK = 2026;
  const HINT_PREFIX = '已綁定：';

  /**
   * @param {Storage|null|undefined} storage
   * @param {() => string} [createId]
   * @returns {string}
   */
  function getOrCreateMachineId(storage, createId) {
    const store = storage || null;
    const gen =
      createId ||
      function () {
        if (root.crypto && typeof root.crypto.randomUUID === 'function') {
          return root.crypto.randomUUID();
        }
        return 'm-' + String(Date.now()) + '-' + String(Math.random()).slice(2, 10);
      };
    if (!store) {
      return gen();
    }
    try {
      const existing = store.getItem(STORAGE_MACHINE_ID);
      if (existing && String(existing).trim()) {
        return String(existing).trim();
      }
      const id = gen();
      store.setItem(STORAGE_MACHINE_ID, id);
      return id;
    } catch (e) {
      return gen();
    }
  }

  /**
   * @param {Storage|null|undefined} storage
   * @returns {object|null}
   */
  function readBindRecord(storage) {
    if (!storage) {
      return null;
    }
    try {
      const raw = storage.getItem(STORAGE_BIND_RECORD);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      return parsed;
    } catch (e) {
      return null;
    }
  }

  /**
   * @param {Storage|null|undefined} storage
   * @param {object} record
   */
  function writeBindRecord(storage, record) {
    if (!storage || !record) {
      return;
    }
    try {
      storage.setItem(STORAGE_BIND_RECORD, JSON.stringify(record));
    } catch (e) {
      /* ignore */
    }
  }

  /**
   * @param {Storage|null|undefined} storage
   * @param {string} brandId
   * @param {string} storeId
   * @returns {boolean}
   */
  function shouldSendBoardBind(storage, brandId, storeId) {
    const record = readBindRecord(storage);
    if (!record) {
      return true;
    }
    const store = String(storeId || '').trim();
    const recordStore = String(record.storeId || '').trim();
    if (!store || recordStore !== store) {
      return true;
    }
    const brand = String(brandId || '').trim();
    const recordBrand = String(record.brandId || '').trim();
    if (brand && recordBrand && brand !== recordBrand) {
      return true;
    }
    return false;
  }

  /**
   * @param {Storage|null|undefined} local
   * @param {Storage|null|undefined} session
   * @returns {boolean}
   */
  function shouldShowBindHint(local, session) {
    if (!session) {
      return false;
    }
    try {
      return session.getItem(SESSION_HINT_ACTIVE) === '1';
    } catch (e) {
      return false;
    }
  }

  /**
   * @param {Storage|null|undefined} local
   * @param {Storage|null|undefined} session
   */
  function markBindHintSessionActive(local, session) {
    if (!session) {
      return;
    }
    try {
      session.setItem(SESSION_HINT_ACTIVE, '1');
    } catch (e) {
      /* ignore */
    }
    if (!local) {
      return;
    }
    try {
      local.setItem(STORAGE_HINT_EVER, '1');
    } catch (e) {
      /* ignore */
    }
  }

  /**
   * @param {Date} d
   * @returns {number}
   */
  function taipeiCalendarYear(d) {
    const date = d instanceof Date ? d : new Date(d);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
    }).formatToParts(date);
    const y = parts.find(function (p) {
      return p.type === 'year';
    });
    return Number(y ? y.value : 0);
  }

  /**
   * @param {Date} d
   * @returns {number}
   */
  function taipeiSecond(d) {
    const date = d instanceof Date ? d : new Date(d);
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Taipei',
      second: 'numeric',
    }).formatToParts(date);
    const s = parts.find(function (p) {
      return p.type === 'second';
    });
    return Number(s ? s.value : 0);
  }

  /**
   * @param {Date} now
   * @returns {number}
   */
  function msUntilNextTaipeiMinute(now) {
    const date = now instanceof Date ? now : new Date(now);
    const sec = taipeiSecond(date);
    const ms = date.getMilliseconds();
    const wait = (60 - sec) * 1000 - ms;
    if (wait <= 0) {
      return 1000;
    }
    return wait;
  }

  /**
   * @param {object} opts
   * @param {string} opts.storeName
   * @param {string} opts.storeNumber
   * @param {Date} opts.now
   * @param {number} [opts.minYearForTime]
   * @param {(d: Date) => string} [opts.formatYmdHm]
   * @returns {string}
   */
  function formatBindHintText(opts) {
    const options = opts && typeof opts === 'object' ? opts : {};
    const storeName = String(options.storeName || '').trim();
    const storeNumber = String(options.storeNumber || '').trim();
    const now = options.now instanceof Date ? options.now : new Date();
    const minYear = Number.isFinite(options.minYearForTime)
      ? options.minYearForTime
      : MIN_YEAR_FOR_CLOCK;
    const TB = QMS.Board.TodayBoard;
    const formatYmdHm =
      options.formatYmdHm ||
      function (d) {
        const ymd = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Taipei',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(d);
        const hm = TB && TB.formatTaipeiClockHM ? TB.formatTaipeiClockHM(d) : '00:00';
        return ymd + ' ' + hm;
      };
    const year = taipeiCalendarYear(now);
    const timeSuffix = year >= minYear ? ' ' + formatYmdHm(now) : '';
    return HINT_PREFIX + storeName + storeNumber + timeSuffix;
  }

  /**
   * @param {number} numFontPx
   * @returns {number}
   */
  function bindHintFontPx(numFontPx) {
    const n = Number(numFontPx);
    if (!Number.isFinite(n) || n <= 0) {
      return 14;
    }
    return Math.max(14, Math.round(n / 4));
  }

  /**
   * @param {object} body
   * @returns {{ ok: true, body: object } | { ok: false, message: string }}
   */
  function buildBoardBindRequest(body) {
    const src = body && typeof body === 'object' ? body : {};
    const brandId = String(src.brandId || '').trim();
    const storeId = String(src.storeId || '').trim();
    const machineId = String(src.machineId || '').trim();
    if (!brandId) {
      return { ok: false, message: 'brandId required' };
    }
    if (!storeId) {
      return { ok: false, message: 'storeId required' };
    }
    if (!machineId) {
      return { ok: false, message: 'machineId required' };
    }
    return {
      ok: true,
      body: {
        brandId: brandId,
        storeId: storeId,
        machineId: machineId,
      },
    };
  }

  QMS.Board.AutoPair = {
    STORAGE_MACHINE_ID: STORAGE_MACHINE_ID,
    STORAGE_BIND_RECORD: STORAGE_BIND_RECORD,
    STORAGE_HINT_EVER: STORAGE_HINT_EVER,
    SESSION_HINT_ACTIVE: SESSION_HINT_ACTIVE,
    MIN_YEAR_FOR_CLOCK: MIN_YEAR_FOR_CLOCK,
    HINT_PREFIX: HINT_PREFIX,
    getOrCreateMachineId: getOrCreateMachineId,
    readBindRecord: readBindRecord,
    writeBindRecord: writeBindRecord,
    shouldSendBoardBind: shouldSendBoardBind,
    shouldShowBindHint: shouldShowBindHint,
    markBindHintSessionActive: markBindHintSessionActive,
    taipeiCalendarYear: taipeiCalendarYear,
    taipeiSecond: taipeiSecond,
    msUntilNextTaipeiMinute: msUntilNextTaipeiMinute,
    formatBindHintText: formatBindHintText,
    bindHintFontPx: bindHintFontPx,
    buildBoardBindRequest: buildBoardBindRequest,
  };
})(typeof window !== 'undefined' ? window : globalThis);
