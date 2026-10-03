/**
 * Canonical today_board document (Firestore) — shared by local & firestore modes.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Board = QMS.Board || {};

  /**
   * @returns {string} YYYY-MM-DD calendar date in Asia/Taipei
   */
  function taipeiCalendarDate(d) {
    const date = d || new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const y = parts.find(function (p) {
      return p.type === 'year';
    });
    const m = parts.find(function (p) {
      return p.type === 'month';
    });
    const day = parts.find(function (p) {
      return p.type === 'day';
    });
    return (y ? y.value : '1970') + '-' + (m ? m.value : '01') + '-' + (day ? day.value : '01');
  }

  function addCalendarDays(ymd, delta) {
    const parts = String(ymd).split('-');
    const y = Number(parts[0]);
    const mo = Number(parts[1]);
    const da = Number(parts[2]);
    const dt = new Date(Date.UTC(y, mo - 1, da));
    dt.setUTCDate(dt.getUTCDate() + delta);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return yy + '-' + mm + '-' + dd;
  }

  /**
   * Business day rolls at 03:00 Asia/Taipei.
   * @returns {string} YYYY-MM-DD
   */
  function taipeiBusinessDate(d) {
    const date = d || new Date();
    const cal = taipeiCalendarDate(date);
    const hm = taipeiHourMinute(date);
    if (hm.hour < 3) {
      return addCalendarDays(cal, -1);
    }
    return cal;
  }

  let sessionBusinessDate = '';

  function normalizeBusinessDateString(businessDate) {
    if (!businessDate) {
      return '';
    }
    return String(businessDate).trim();
  }

  function setSessionBusinessDate(businessDate) {
    const bd = normalizeBusinessDateString(businessDate);
    if (bd) {
      sessionBusinessDate = bd;
    }
  }

  function getSessionBusinessDate() {
    return sessionBusinessDate;
  }

  function hasSessionBusinessDate() {
    return Boolean(sessionBusinessDate);
  }

  function clearSessionBusinessDate() {
    sessionBusinessDate = '';
  }

  /**
   * Business day from a readable HTTP Date header (never from box clock directly).
   * @param {string} httpDateHeader
   * @returns {string}
   */
  function businessDateFromHttpDate(httpDateHeader) {
    const raw = String(httpDateHeader || '').trim();
    if (!raw) {
      return '';
    }
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      return '';
    }
    return taipeiBusinessDate(d);
  }

  /**
   * @param {{ boardBusinessDate?: string, httpDateHeader?: string, httpDateReadable?: boolean }} input
   * @returns {{ ok: true, businessDate: string, source: 'board' | 'http_date' } | { ok: false }}
   */
  function resolveSessionBusinessDate(input) {
    const boardBd = normalizeBusinessDateString(input && input.boardBusinessDate);
    if (boardBd) {
      return { ok: true, businessDate: boardBd, source: 'board' };
    }
    if (input && input.httpDateReadable && input.httpDateHeader) {
      const fromHttp = businessDateFromHttpDate(input.httpDateHeader);
      if (fromHttp) {
        return { ok: true, businessDate: fromHttp, source: 'http_date' };
      }
    }
    return { ok: false };
  }

  /**
   * @param {string} businessDate
   */
  function isSameBusinessDate(a, b) {
    const aa = normalizeBusinessDateString(a);
    const bb = normalizeBusinessDateString(b);
    if (!aa || !bb) {
      return false;
    }
    return aa === bb;
  }

  /**
   * Compare against active session business day (never box clock).
   * @param {string} businessDate
   */
  function isCurrentBusinessDate(businessDate) {
    if (!hasSessionBusinessDate()) {
      return false;
    }
    return isSameBusinessDate(businessDate, sessionBusinessDate);
  }

  function isCacheBusinessDateCurrent(cachedBusinessDate) {
    if (!hasSessionBusinessDate()) {
      return false;
    }
    return isSameBusinessDate(cachedBusinessDate, sessionBusinessDate);
  }

  /**
   * @param {Date} [d]
   * @returns {{ hour: number, minute: number }}
   */
  function taipeiHourMinute(d) {
    const date = d || new Date();
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Taipei',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(date);
    const h = parts.find(function (p) {
      return p.type === 'hour';
    });
    const m = parts.find(function (p) {
      return p.type === 'minute';
    });
    return {
      hour: Number(h ? h.value : 0),
      minute: Number(m ? m.value : 0),
    };
  }

  /**
   * Header clock HH:mm (24h) in Asia/Taipei, independent of device timezone.
   * @param {Date} [d]
   * @returns {string}
   */
  function formatTaipeiClockHM(d) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Taipei',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(d || new Date());
    const h = parts.find(function (p) {
      return p.type === 'hour';
    });
    const m = parts.find(function (p) {
      return p.type === 'minute';
    });
    const hh = h ? h.value : '00';
    const mm = m ? m.value : '00';
    return hh + ':' + mm;
  }

  /**
   * @param {Array<{ no: string, status: string, updatedAt?: string }>} tickets
   * @param {{ preparingType?: string, readyType?: string }} [opts]
   * @returns {Array<{ source_type: string, number: string }>}
   */
  function ticketsToNumberContent(tickets, opts) {
    const preparingType = (opts && opts.preparingType) || 'From_Store_Preparing';
    const readyType = (opts && opts.readyType) || 'From_Store_OK';
    const out = [];
    const list = Array.isArray(tickets) ? tickets : [];
    for (let i = 0; i < list.length; i += 1) {
      const t = list[i];
      if (!t || typeof t.no !== 'string') {
        continue;
      }
      if (typeof t.source_type === 'string' && t.source_type) {
        out.push({ source_type: t.source_type, number: t.no });
        continue;
      }
      if (t.status === 'ready') {
        const st =
          (opts && opts.readyByKey && t.sourceKey && opts.readyByKey[t.sourceKey]) || readyType;
        out.push({ source_type: st, number: t.no });
      } else if (t.status === 'preparing') {
        const st =
          (opts && opts.prepByKey && t.sourceKey && opts.prepByKey[t.sourceKey]) || preparingType;
        out.push({ source_type: st, number: t.no });
      }
    }
    return out;
  }

  /**
   * @param {Array<{ source_type: string, number: string }>} numberContent
   * @returns {Array<{ no: string, status: 'preparing'|'ready', updatedAt: string }>}
   */
  function numberContentToTickets(numberContent) {
    const now = new Date().toISOString();
    const out = [];
    const list = Array.isArray(numberContent) ? numberContent : [];
    for (let i = 0; i < list.length; i += 1) {
      const row = list[i];
      if (!row || typeof row.number !== 'string' || typeof row.source_type !== 'string') {
        continue;
      }
      let status = 'preparing';
      if (row.source_type.indexOf('_OK') === row.source_type.length - 3) {
        status = 'ready';
      } else if (row.source_type.indexOf('_Preparing') !== -1) {
        status = 'preparing';
      } else {
        continue;
      }
      out.push({
        no: row.number,
        status: status,
        updatedAt: now,
        source_type: row.source_type,
      });
    }
    return out;
  }

  /**
   * @param {string|Date} [isoOrDate]
   * @returns {string}
   */
  function formatTaipeiDateTimeHuman(isoOrDate) {
    const d =
      typeof isoOrDate === 'string'
        ? new Date(isoOrDate)
        : isoOrDate instanceof Date
          ? isoOrDate
          : new Date();
    if (Number.isNaN(d.getTime())) {
      return '—';
    }
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(d);
  }

  /**
   * @param {object} raw
   * @returns {{ ok: true, board: object } | { ok: false, error: string }}
   */
  function normalizeTodayBoard(raw) {
    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: 'invalid board' };
    }
    const seq = Number(raw.seq);
    if (!Number.isFinite(seq)) {
      return { ok: false, error: 'invalid seq' };
    }
    const tickets = Array.isArray(raw.tickets) ? raw.tickets : [];
    return {
      ok: true,
      board: {
        storeId: String(raw.storeId || ''),
        businessDate: String(raw.businessDate || ''),
        seq: seq,
        updatedAt: String(raw.updatedAt || ''),
        source: raw.source === 'A' || raw.source === 'B' || raw.source === 'system' ? raw.source : 'A',
        tickets: tickets,
        clearedAt: raw.clearedAt || null,
      },
    };
  }

  /**
   * @param {string} storeId
   * @param {number} seq
   * @param {Array<object>} tickets
   * @param {'A'|'B'|'system'} source
   */
  function buildTodayBoard(storeId, seq, tickets, source, businessDate) {
    const bd = normalizeBusinessDateString(businessDate) || taipeiBusinessDate();
    return {
      storeId: storeId,
      businessDate: bd,
      seq: seq,
      updatedAt: new Date().toISOString(),
      source: source || 'A',
      tickets: tickets,
      clearedAt: tickets.length === 0 ? new Date().toISOString() : null,
    };
  }

  QMS.Board.TodayBoard = {
    taipeiCalendarDate: taipeiCalendarDate,
    taipeiBusinessDate: taipeiBusinessDate,
    setSessionBusinessDate: setSessionBusinessDate,
    getSessionBusinessDate: getSessionBusinessDate,
    hasSessionBusinessDate: hasSessionBusinessDate,
    clearSessionBusinessDate: clearSessionBusinessDate,
    businessDateFromHttpDate: businessDateFromHttpDate,
    resolveSessionBusinessDate: resolveSessionBusinessDate,
    isSameBusinessDate: isSameBusinessDate,
    isCacheBusinessDateCurrent: isCacheBusinessDateCurrent,
    isCurrentBusinessDate: isCurrentBusinessDate,
    taipeiHourMinute: taipeiHourMinute,
    formatTaipeiClockHM: formatTaipeiClockHM,
    formatTaipeiDateTimeHuman: formatTaipeiDateTimeHuman,
    ticketsToNumberContent: ticketsToNumberContent,
    numberContentToTickets: numberContentToTickets,
    normalizeTodayBoard: normalizeTodayBoard,
    buildTodayBoard: buildTodayBoard,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
