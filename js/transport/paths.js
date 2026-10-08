/**
 * Firestore paths（milksha-cloud 定案）。
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

  function devicePendingControlPath(storeId, deviceId) {
    return deviceDocPath(storeId, deviceId) + '/control/pending';
  }

  function devicesCollectionPath(storeId) {
    return 'stores/' + encodeURIComponent(storeId) + '/devices';
  }

  function tpl(template, storeId) {
    return String(template || '').replace(/\{storeId\}/g, encodeURIComponent(storeId));
  }

  function receiveLogsPath(template, storeId) {
    return tpl(template || 'stores/{storeId}/receive_logs', storeId);
  }

  function commandsPath(template, storeId) {
    return tpl(template || 'stores/{storeId}/commands', storeId);
  }

  function ingestEventsPath(template, storeId) {
    return tpl(template || 'stores/{storeId}/ingest_events', storeId);
  }

  QMS.Transport.Paths = {
    todayBoardPath: todayBoardPath,
    deviceDocPath: deviceDocPath,
    devicePendingControlPath: devicePendingControlPath,
    devicesCollectionPath: devicesCollectionPath,
    receiveLogsPath: receiveLogsPath,
    commandsPath: commandsPath,
    ingestEventsPath: ingestEventsPath,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
