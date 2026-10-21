/**
 * Central board zone sorting (preparing / ready) by POS ms with fallbacks.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Board = QMS.Board || {};

  const PosTime = QMS.Board.PosTimeFields;
  const F = PosTime ? PosTime.BOARD_POS_TIME_FIELD : {};

  /**
   * @param {unknown} value
   * @returns {number | null}
   */
  function parseMs(value) {
    return PosTime ? PosTime.parsePosTimeMs(value) : null;
  }

  /**
   * @param {object} row
   * @returns {boolean}
   */
  function usesPosTieBreak(row) {
    if (!PosTime || !row) {
      return false;
    }
    return PosTime.rowHasAnyPosTimeField(row);
  }

  /**
   * Local receive time is `item.firstSeenAt` (preparing) / `item.readyAt` (ready), set in applyPayload.
   * @param {object} item
   * @returns {number}
   */
  function resolvePreparingSortMs(item) {
    const fromPos = parseMs(item && item[F.firstSeenPosAtMs]);
    if (fromPos != null) {
      return fromPos;
    }
    const fromUpdated = parseMs(item && item.updatedAt);
    if (fromUpdated != null) {
      return fromUpdated;
    }
    const local = parseMs(item && item.firstSeenAt);
    if (local != null) {
      return local;
    }
    return 0;
  }

  /**
   * @param {object} item
   * @returns {number}
   */
  function resolveReadySortMs(item) {
    const fromPos = parseMs(item && item[F.readyPosAtMs]);
    if (fromPos != null) {
      return fromPos;
    }
    const fromUpdated = parseMs(item && item.updatedAt);
    if (fromUpdated != null) {
      return fromUpdated;
    }
    const local = parseMs(item && item.readyAt);
    if (local != null) {
      return local;
    }
    return 0;
  }

  /**
   * @param {string | number} a
   * @param {string | number} b
   * @returns {number}
   */
  function compareNumberAsc(a, b) {
    const na = String(a);
    const nb = String(b);
    const da = Number(na);
    const db = Number(nb);
    if (Number.isFinite(da) && Number.isFinite(db) && String(da) === na && String(db) === nb) {
      return da - db;
    }
    return na.localeCompare(nb, undefined, { numeric: true });
  }

  /**
   * @param {object} a
   * @param {object} b
   * @param {'preparing' | 'ready'} zone
   * @returns {number}
   */
  function compareBoardZoneItems(a, b, zone) {
    const ta = zone === 'ready' ? resolveReadySortMs(a) : resolvePreparingSortMs(a);
    const tb = zone === 'ready' ? resolveReadySortMs(b) : resolvePreparingSortMs(b);
    if (ta !== tb) {
      return tb - ta;
    }

    const posTie = usesPosTieBreak(a) || usesPosTieBreak(b);
    if (posTie) {
      const seqKey = zone === 'ready' ? F.readySeqInBatch : F.seqInBatch;
      const sa = Number.isFinite(a[seqKey]) ? a[seqKey] : Number.MAX_SAFE_INTEGER;
      const sb = Number.isFinite(b[seqKey]) ? b[seqKey] : Number.MAX_SAFE_INTEGER;
      if (sa !== sb) {
        return sa - sb;
      }
    } else {
      const ia = Number.isFinite(a.payloadIndex) ? a.payloadIndex : 0;
      const ib = Number.isFinite(b.payloadIndex) ? b.payloadIndex : 0;
      if (ia !== ib) {
        return ib - ia;
      }
    }

    return compareNumberAsc(a.number, b.number);
  }

  /**
   * @param {Array<object>} items
   * @param {'preparing' | 'ready'} zone
   * @returns {Array<object>}
   */
  function sortBoardZoneItems(items, zone) {
    const list = Array.isArray(items) ? items.slice() : [];
    list.sort(function (a, b) {
      return compareBoardZoneItems(a, b, zone);
    });
    return list;
  }

  QMS.Board.BoardItemSort = {
    resolvePreparingSortMs: resolvePreparingSortMs,
    resolveReadySortMs: resolveReadySortMs,
    compareBoardZoneItems: compareBoardZoneItems,
    sortBoardZoneItems: sortBoardZoneItems,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
