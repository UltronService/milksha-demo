/**
 * POS2756 APK test page — shared logic (browser + node unit tests).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Pos2756Test = QMS.Pos2756Test || {};

  const MAX_LOG_LINES = 200;
  const DEVICE_ID = '5848';
  const FIRESTORE_PROJECT_ID = 'ultron-player-2022';
  const COLLECTION_ID = 'LianFaServerLog';

  function formatTaipeiLogTime(dateInput) {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const get = function (type) {
      const hit = parts.find(function (p) {
        return p.type === type;
      });
      return hit ? hit.value : '';
    };
    return (
      get('year') +
      '-' +
      get('month') +
      '-' +
      get('day') +
      ' ' +
      get('hour') +
      ':' +
      get('minute') +
      ':' +
      get('second')
    );
  }

  function formatRawApkArgument(arg) {
    if (arg === undefined) {
      return '';
    }
    if (arg === null) {
      return 'null';
    }
    if (typeof arg === 'string') {
      return arg;
    }
    try {
      return JSON.stringify(arg);
    } catch (_err) {
      return String(arg);
    }
  }

  function buildOrderStatusLine(rawArg, now) {
    const time = formatTaipeiLogTime(now);
    return time + ' ' + formatRawApkArgument(rawArg);
  }

  function buildSoldoutLine(rawArg, now) {
    const time = formatTaipeiLogTime(now);
    return time + ' getSoldoutItem ' + formatRawApkArgument(rawArg);
  }

  function trimLogLines(lines, maxLines) {
    const max = maxLines == null ? MAX_LOG_LINES : maxLines;
    if (!Array.isArray(lines) || lines.length <= max) {
      return lines ? lines.slice() : [];
    }
    return lines.slice(0, max);
  }

  function prependLogLine(lines, line, maxLines) {
    const base = Array.isArray(lines) ? lines : [];
    return trimLogLines([line].concat(base), maxLines);
  }

  function buildDeviceLogQuery(deviceId, limit) {
    return {
      structuredQuery: {
        from: [{ collectionId: COLLECTION_ID }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'deviceId' },
            op: 'EQUAL',
            value: { stringValue: String(deviceId) },
          },
        },
        orderBy: [{ field: { fieldPath: 'receiveTime' }, direction: 'DESCENDING' }],
        limit: limit == null ? 100 : limit,
      },
    };
  }

  function firestoreRunQueryUrl(projectId) {
    const pid = projectId || FIRESTORE_PROJECT_ID;
    return (
      'https://firestore.googleapis.com/v1/projects/' +
      pid +
      '/databases/(default)/documents:runQuery'
    );
  }

  function parseRunQueryRows(payload) {
    if (!Array.isArray(payload)) {
      return [];
    }
    const rows = [];
    for (let i = 0; i < payload.length; i++) {
      const item = payload[i];
      if (!item || !item.document) {
        continue;
      }
      const doc = item.document;
      const name = String(doc.name || '');
      const id = name.split('/').pop() || name;
      const fields = doc.fields || {};
      const receiveTimeField = fields.receiveTime;
      const receiveTime =
        receiveTimeField && receiveTimeField.stringValue ? receiveTimeField.stringValue : '';
      rows.push({
        id: id,
        createTime: doc.createTime || '',
        receiveTime: receiveTime,
      });
    }
    return rows;
  }

  function countLogsSincePageOpen(rows, pageOpenedAtIso) {
    const openMs = Date.parse(pageOpenedAtIso);
    if (!Number.isFinite(openMs)) {
      return 0;
    }
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      const ct = Date.parse(rows[i].createTime);
      if (Number.isFinite(ct) && ct >= openMs) {
        count += 1;
      }
    }
    return count;
  }

  function summarizeDeviceLogs(rows, pageOpenedAtIso) {
    const latestReceiveTime = rows.length > 0 && rows[0].receiveTime ? rows[0].receiveTime : '—';
    return {
      latestReceiveTime: latestReceiveTime,
      countSinceOpen: countLogsSincePageOpen(rows, pageOpenedAtIso),
    };
  }

  function formatTopStatusOk(summary) {
    return (
      'deviceId=' +
      DEVICE_ID +
      ' 最新 receiveTime=' +
      summary.latestReceiveTime +
      ' 本頁開啟後筆數=' +
      String(summary.countSinceOpen)
    );
  }

  function formatTopStatusError(reason) {
    const text = reason == null ? '' : String(reason);
    return '讀不到\n' + text;
  }

  function safeCallOrderStatus(handler, rawArg) {
    try {
      handler(rawArg);
    } catch (_err) {
      /* APK page must never throw */
    }
  }

  function safeCallSoldout(handler, rawArg) {
    try {
      handler(rawArg);
    } catch (_err) {
      /* APK page must never throw */
    }
  }

  QMS.Pos2756Test.Core = {
    MAX_LOG_LINES: MAX_LOG_LINES,
    DEVICE_ID: DEVICE_ID,
    FIRESTORE_PROJECT_ID: FIRESTORE_PROJECT_ID,
    COLLECTION_ID: COLLECTION_ID,
    formatTaipeiLogTime: formatTaipeiLogTime,
    formatRawApkArgument: formatRawApkArgument,
    buildOrderStatusLine: buildOrderStatusLine,
    buildSoldoutLine: buildSoldoutLine,
    trimLogLines: trimLogLines,
    prependLogLine: prependLogLine,
    buildDeviceLogQuery: buildDeviceLogQuery,
    firestoreRunQueryUrl: firestoreRunQueryUrl,
    parseRunQueryRows: parseRunQueryRows,
    countLogsSincePageOpen: countLogsSincePageOpen,
    summarizeDeviceLogs: summarizeDeviceLogs,
    formatTopStatusOk: formatTopStatusOk,
    formatTopStatusError: formatTopStatusError,
    safeCallOrderStatus: safeCallOrderStatus,
    safeCallSoldout: safeCallSoldout,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
