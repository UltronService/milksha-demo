/**
 * push_numbers devCommand params ↔ number_content (legacy string lists + sourceType entries).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  /**
   * @param {unknown} entry
   * @param {'ready'|'preparing'} zone
   * @returns {{ source_type: string, number: string } | null}
   */
  function pushEntryToNumberContentRow(entry, zone) {
    const defaultReady = 'From_Store_OK';
    const defaultPrep = 'From_Store_Preparing';
    if (typeof entry === 'string') {
      const no = entry.trim();
      if (!no) {
        return null;
      }
      return {
        source_type: zone === 'ready' ? defaultReady : defaultPrep,
        number: no,
      };
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return null;
    }
    const no = entry.no != null ? String(entry.no).trim() : '';
    let sourceType = entry.sourceType != null ? String(entry.sourceType).trim() : '';
    if (!sourceType && entry.source_type != null) {
      sourceType = String(entry.source_type).trim();
    }
    if (!no || !sourceType) {
      return null;
    }
    return { source_type: sourceType, number: no };
  }

  /**
   * @param {{ ready?: unknown[], preparing?: unknown[] } | null | undefined} params
   * @returns {Array<{ source_type: string, number: string }>}
   */
  function pushNumbersParamsToNumberContent(params) {
    const out = [];
    const raw = params && typeof params === 'object' ? params : {};
    const ready = Array.isArray(raw.ready) ? raw.ready : [];
    const preparing = Array.isArray(raw.preparing) ? raw.preparing : [];
    ready.forEach(function (entry) {
      const row = pushEntryToNumberContentRow(entry, 'ready');
      if (row) {
        out.push(row);
      }
    });
    preparing.forEach(function (entry) {
      const row = pushEntryToNumberContentRow(entry, 'preparing');
      if (row) {
        out.push(row);
      }
    });
    return out;
  }

  /**
   * @param {Array<{ no: string, status: string, sourceKey?: string }>} tickets
   * @param {(sourceKey: string) => { preparing: string, ok: string }} sourceDefForKey
   * @returns {{ ready: Array<{ no: string, sourceType: string }>, preparing: Array<{ no: string, sourceType: string }> }}
   */
  function ticketsToPushNumbersParams(tickets, sourceDefForKey) {
    const ready = [];
    const preparing = [];
    const list = Array.isArray(tickets) ? tickets : [];
    list.forEach(function (t) {
      if (!t || typeof t.no !== 'string') {
        return;
      }
      const key = t.sourceKey || 'store';
      const def = sourceDefForKey(key);
      const sourceType = t.status === 'ready' ? def.ok : def.preparing;
      const entry = { no: t.no, sourceType: sourceType };
      if (t.status === 'ready') {
        ready.push(entry);
      } else {
        preparing.push(entry);
      }
    });
    return { ready: ready, preparing: preparing };
  }

  QMS.Transport.PushNumbersParams = {
    pushEntryToNumberContentRow: pushEntryToNumberContentRow,
    pushNumbersParamsToNumberContent: pushNumbersParamsToNumberContent,
    ticketsToPushNumbersParams: ticketsToPushNumbersParams,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
