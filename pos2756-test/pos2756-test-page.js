/**
 * POS2756 APK test page — browser boot (read-only Firestore poll + log UI).
 */
(function () {
  'use strict';

  var Core = window.QMS && window.QMS.Pos2756Test && window.QMS.Pos2756Test.Core;
  if (!Core) {
    return;
  }

  var topEl = document.getElementById('top-status');
  var bottomEl = document.getElementById('bottom-log');
  var logLines = [];
  var pageOpenedAtIso = new Date().toISOString();
  var pollTimer = null;

  function renderBottom() {
    if (!bottomEl) {
      return;
    }
    bottomEl.textContent = logLines.join('\n');
  }

  function appendOrderLine(rawArg) {
    var line = Core.buildOrderStatusLine(rawArg, new Date());
    logLines = Core.prependLogLine(logLines, line, Core.MAX_LOG_LINES);
    renderBottom();
  }

  function appendSoldoutLine(rawArg) {
    var line = Core.buildSoldoutLine(rawArg, new Date());
    logLines = Core.prependLogLine(logLines, line, Core.MAX_LOG_LINES);
    renderBottom();
  }

  function bindApkBridge() {
    var bridge = window.__pos2756ApkBridge;
    if (!bridge) {
      return;
    }
    bridge.onOrder = appendOrderLine;
    bridge.onSoldout = appendSoldoutLine;
    if (typeof bridge.drainPending === 'function') {
      bridge.drainPending(function (item) {
        if (!item) {
          return;
        }
        if (item.kind === 'soldout') {
          appendSoldoutLine(item.raw);
          return;
        }
        appendOrderLine(item.raw);
      });
    }
  }

  function setTop(text) {
    if (topEl) {
      topEl.textContent = text;
    }
  }

  function pollFirestore() {
    var url = Core.firestoreRunQueryUrl(Core.FIRESTORE_PROJECT_ID);
    var body = Core.buildDeviceLogQuery(Core.DEVICE_ID, 100);
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (t) {
            throw new Error('HTTP ' + res.status + (t ? ': ' + t.slice(0, 120) : ''));
          });
        }
        return res.json();
      })
      .then(function (payload) {
        var rows = Core.parseRunQueryRows(payload);
        var summary = Core.summarizeDeviceLogs(rows, pageOpenedAtIso);
        setTop(Core.formatTopStatusOk(summary));
      })
      .catch(function (err) {
        var reason = err && err.message ? err.message : String(err);
        setTop(Core.formatTopStatusError(reason));
      });
  }

  function startPolling() {
    pollFirestore();
    pollTimer = window.setInterval(pollFirestore, 5000);
  }

  bindApkBridge();
  startPolling();
})();
