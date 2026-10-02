/**
 * Canonical today_board document (Firestore) — shared by local & firestore modes.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Board = QMS.Board || {};

  /**
   * @returns {string} YYYY-MM-DD in Asia/Taipei
   */
  function taipeiBusinessDate(d) {
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
  function buildTodayBoard(storeId, seq, tickets, source) {
    return {
      storeId: storeId,
      businessDate: taipeiBusinessDate(),
      seq: seq,
      updatedAt: new Date().toISOString(),
      source: source || 'A',
      tickets: tickets,
      clearedAt: tickets.length === 0 ? new Date().toISOString() : null,
    };
  }

  QMS.Board.TodayBoard = {
    taipeiBusinessDate: taipeiBusinessDate,
    taipeiHourMinute: taipeiHourMinute,
    formatTaipeiClockHM: formatTaipeiClockHM,
    formatTaipeiDateTimeHuman: formatTaipeiDateTimeHuman,
    ticketsToNumberContent: ticketsToNumberContent,
    numberContentToTickets: numberContentToTickets,
    normalizeTodayBoard: normalizeTodayBoard,
    buildTodayBoard: buildTodayBoard,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
