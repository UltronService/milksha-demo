/**
 * Map cloud today_board.tickets[] → controller local tickets (sourceType readback).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Controller = QMS.Controller || {};

  /**
   * @param {unknown} t
   * @returns {string}
   */
  function resolveCloudSourceTypeString(t) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) {
      return '';
    }
    const raw = t.sourceType;
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const nested = raw.sourceType != null ? String(raw.sourceType).trim() : '';
      if (nested) {
        return nested;
      }
    }
    if (typeof t.source_type === 'string' && t.source_type.trim()) {
      return t.source_type.trim();
    }
    return '';
  }

  /**
   * @param {unknown} t
   * @returns {string}
   */
  function resolveCloudTicketNo(t) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) {
      return '';
    }
    if (t.no != null && String(t.no).trim()) {
      return String(t.no).trim();
    }
    const raw = t.sourceType;
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.no != null) {
      return String(raw.no).trim();
    }
    return '';
  }

  /**
   * @param {unknown} t
   * @param {(st: string) => { sourceKey: string } | null} parseSourceType
   * @returns {string}
   */
  function ticketSourceKeyFromCloudTicket(t, parseSourceType) {
    if (t && typeof t === 'object' && t.sourceKey) {
      return String(t.sourceKey);
    }
    const st = resolveCloudSourceTypeString(t);
    if (st && typeof parseSourceType === 'function') {
      const parsed = parseSourceType(st);
      if (parsed && parsed.sourceKey) {
        return parsed.sourceKey;
      }
    }
    return 'store';
  }

  /**
   * @param {unknown[]} cloudTickets
   * @param {(st: string) => { sourceKey: string } | null} parseSourceType
   * @returns {Array<{ no: string, status: string, sourceKey: string, source_type?: string, sourceType?: string, updatedAt: string }>}
   */
  function mapCloudBoardTicketsToLocal(cloudTickets, parseSourceType) {
    const list = Array.isArray(cloudTickets) ? cloudTickets : [];
    return list.map(function (t) {
      const sourceTypeStr = resolveCloudSourceTypeString(t);
      const no = resolveCloudTicketNo(t);
      const status = t && t.status != null ? String(t.status) : 'ready';
      return {
        no: no,
        status: status,
        sourceKey: ticketSourceKeyFromCloudTicket(t, parseSourceType),
        source_type: sourceTypeStr || undefined,
        sourceType: sourceTypeStr || undefined,
        updatedAt: (t && t.updatedAt) || new Date().toISOString(),
      };
    });
  }

  QMS.Controller.CloudTicketReadback = {
    resolveCloudSourceTypeString: resolveCloudSourceTypeString,
    resolveCloudTicketNo: resolveCloudTicketNo,
    ticketSourceKeyFromCloudTicket: ticketSourceKeyFromCloudTicket,
    mapCloudBoardTicketsToLocal: mapCloudBoardTicketsToLocal,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
