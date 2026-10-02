/**
 * Board seq merge and ready-zone diff (no catch-up ring on stale seq).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  /**
   * @param {number} incomingSeq
   * @param {number} localSeq
   * @returns {boolean}
   */
  function shouldAcceptBoard(incomingSeq, localSeq) {
    const inc = Number(incomingSeq);
    const loc = Number(localSeq);
    if (!Number.isFinite(inc)) {
      return false;
    }
    if (!Number.isFinite(loc) || loc <= 0) {
      return true;
    }
    return inc > loc;
  }

  /**
   * @param {Array<{ source_type: string, number: string }>} numberContent
   * @param {(st: string) => { sourceKey: string, zone: string } | null} parseSourceType
   * @param {(sk: string, num: string) => string} makeItemId
   * @returns {Set<string>}
   */
  function readyIdSetFromContent(numberContent, parseSourceType, makeItemId) {
    const set = new Set();
    const list = Array.isArray(numberContent) ? numberContent : [];
    const readyIds = {};
    for (let i = 0; i < list.length; i += 1) {
      const row = list[i];
      if (!row || typeof row.number !== 'string') {
        continue;
      }
      const parsed = parseSourceType(row.source_type);
      if (!parsed || parsed.zone !== 'ready') {
        continue;
      }
      const id = makeItemId(parsed.sourceKey, row.number);
      if (!readyIds[id]) {
        readyIds[id] = true;
        set.add(id);
      }
    }
    return set;
  }

  /**
   * @param {Set<string>} prevReady
   * @param {Set<string>} nextReady
   * @returns {string[]}
   */
  function newlyReadyIds(prevReady, nextReady) {
    const out = [];
    nextReady.forEach(function (id) {
      if (!prevReady.has(id)) {
        out.push(id);
      }
    });
    return out;
  }

  QMS.Transport.BoardSeq = {
    shouldAcceptBoard: shouldAcceptBoard,
    readyIdSetFromContent: readyIdSetFromContent,
    newlyReadyIds: newlyReadyIds,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
