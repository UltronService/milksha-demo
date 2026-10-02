/**
 * Firestore paths（與 milksha-cloud 定案格式對齊；紀錄路徑可設定）。
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  function todayBoardPath(storeId) {
    return 'stores/' + encodeURIComponent(storeId) + '/board/today_board';
  }

  function deviceDocPath(storeId, deviceId) {
    return (
      'stores/' + encodeURIComponent(storeId) + '/devices/' + encodeURIComponent(deviceId)
    );
  }

  function devicesCollectionPath(storeId) {
    return 'stores/' + encodeURIComponent(storeId) + '/devices';
  }

  /**
   * @param {string} template e.g. stores/{storeId}/logs
   * @param {string} storeId
   */
  function logsCollectionPath(template, storeId) {
    return String(template || 'stores/{storeId}/logs').replace('{storeId}', encodeURIComponent(storeId));
  }

  QMS.Transport.Paths = {
    todayBoardPath: todayBoardPath,
    deviceDocPath: deviceDocPath,
    devicesCollectionPath: devicesCollectionPath,
    logsCollectionPath: logsCollectionPath,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
