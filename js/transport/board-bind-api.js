/**
 * Cloud board bind API boundary (brand + store + machine id).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  /**
   * @param {object} cloudApi from createCloudApi
   * @param {object} payload
   * @returns {Promise<{ storeName: string, storeNumber: string, isFirstBind: boolean }>}
   */
  async function requestBoardBind(cloudApi, payload) {
    const AutoPair = QMS.Board && QMS.Board.AutoPair;
    const built =
      AutoPair && AutoPair.buildBoardBindRequest
        ? AutoPair.buildBoardBindRequest(payload)
        : { ok: true, body: payload };
    if (!built.ok) {
      const err = new Error(built.message || 'invalid board bind');
      err.status = 400;
      throw err;
    }
    if (!cloudApi || typeof cloudApi.boardBind !== 'function') {
      const err = new Error('boardBind not available');
      err.status = 501;
      throw err;
    }
    try {
      const json = await cloudApi.boardBind(built.body);
      const storeName = String(json && json.storeName != null ? json.storeName : '').trim();
      const storeNumber = String(
        json && json.storeNumber != null ? json.storeNumber : built.body.storeId,
      ).trim();
      if (!storeName) {
        const err = new Error('board bind missing storeName');
        err.status = 502;
        throw err;
      }
      return {
        storeName: storeName,
        storeNumber: storeNumber,
        isFirstBind: Boolean(json && json.isFirstBind),
      };
    } catch (e) {
      throw e;
    }
  }

  QMS.Transport.BoardBindApi = {
    requestBoardBind: requestBoardBind,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
