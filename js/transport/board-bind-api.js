/**
 * Cloud boardAutoPair API boundary (milksha-cloud docs/auto-pairing-interface.md).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  /**
   * @param {object} json
   * @returns {{ ok: true, storeId: string, storeName: string, storeNumber: string, isFirstBind: boolean, customToken: string }}
   */
  function normalizePairSuccess(json) {
    const storeName = String(json && json.storeName != null ? json.storeName : '').trim();
    const storeId = String(json && json.storeId != null ? json.storeId : '').trim();
    const storeNumber = String(json && json.storeNumber != null ? json.storeNumber : '').trim();
    const customToken = String(json && json.customToken != null ? json.customToken : '').trim();
    if (!storeName || !storeId || !storeNumber || !customToken) {
      const err = new Error('boardAutoPair incomplete success body');
      err.status = 502;
      err.response = json;
      throw err;
    }
    return {
      ok: true,
      storeId: storeId,
      storeName: storeName,
      storeNumber: storeNumber,
      isFirstBind: Boolean(json && json.isFirstBind),
      customToken: customToken,
    };
  }

  /**
   * @param {object} cloudApi from createCloudApi
   * @param {object} payload initial or read fields + deviceId
   * @returns {Promise<ReturnType<typeof normalizePairSuccess>>}
   */
  async function requestBoardAutoPair(cloudApi, payload) {
    const AutoPair = QMS.Board && QMS.Board.AutoPair;
    const built =
      AutoPair && AutoPair.buildAutoPairRequest
        ? AutoPair.buildAutoPairRequest(payload)
        : { ok: true, body: payload, mode: 'initial' };
    if (!built.ok) {
      const err = new Error(built.message || 'invalid boardAutoPair');
      err.status = 400;
      throw err;
    }
    if (!cloudApi || typeof cloudApi.boardAutoPair !== 'function') {
      const err = new Error('boardAutoPair not available');
      err.status = 501;
      throw err;
    }
    try {
      const json = await cloudApi.boardAutoPair(built.body);
      if (json && json.ok === false) {
        const err = new Error(String(json.information || 'boardAutoPair failed'));
        err.status = 200;
        err.response = json;
        err.pairOkFalse = true;
        throw err;
      }
      if (!json || json.ok !== true) {
        const err = new Error('boardAutoPair unexpected response');
        err.status = 502;
        err.response = json;
        throw err;
      }
      return normalizePairSuccess(json);
    } catch (e) {
      throw e;
    }
  }

  QMS.Transport.BoardBindApi = {
    requestBoardAutoPair: requestBoardAutoPair,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
