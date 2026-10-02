/**
 * Boot cloud/local sync on receiver-demo when ?mode=local|firestore
 */
(function (root) {
  'use strict';

  function readCreds(params) {
    const storeId = params.get('store') || 's120030';
    const deviceId = params.get('device') || root.localStorage.getItem('milksha:deviceId') || 'stb-01';
    const code = params.get('code') || root.localStorage.getItem('milksha:accessCode') || 'dev-code';
    if (params.get('device')) {
      root.localStorage.setItem('milksha:deviceId', deviceId);
    }
    if (params.get('code')) {
      root.localStorage.setItem('milksha:accessCode', code);
    }
    return { storeId: storeId, deviceId: deviceId, accessCode: code };
  }

  function boot() {
    const QMS = root.QMS;
    if (!QMS || !QMS.Transport || !QMS.Receiver) {
      return;
    }
    const params = new URLSearchParams(root.location.search);
    // preserve emulatorPrefix / gateway from URL when booting
    const modeResolved = QMS.Transport.resolveModeFromUrl(
      params,
      root.MILKSHA_FIREBASE_CONFIG || {},
    );
    const mode = (params.get('mode') || '').toLowerCase();
    if (mode !== 'local' && mode !== 'firestore') {
      return;
    }

    const creds = readCreds(params);
    const transport = QMS.Transport.createTransport(modeResolved.mode, {
      storeId: creds.storeId,
      config: modeResolved.config,
      role: 'device',
      deviceId: creds.deviceId,
      accessCode: creds.accessCode,
    });

    function waitDemo() {
      if (!root.receiverDemo) {
        setTimeout(waitDemo, 30);
        return;
      }
      const statusEl = root.document.getElementById('rcv-cloud-status');
      const startCloud = function () {
      const cloud = QMS.Receiver.bootReceiverCloud({
        storeId: creds.storeId,
        deviceId: creds.deviceId,
        transport: transport,
        receiverDemo: root.receiverDemo,
        boardPollIntervalMs: modeResolved.config.boardPollIntervalMs,
        devicePollIntervalMs: modeResolved.config.devicePollIntervalMs,
        heartbeatIntervalMs: modeResolved.config.heartbeatIntervalMs,
        readyHideMinutes: Number(params.get('readyHideMin') || 0),
        onStatusLine: function (line) {
          if (statusEl) {
            statusEl.textContent = line;
          }
        },
      });
      cloud.start();
      root.receiveBoard = cloud.receiveBoard;
      root.receiverCloud = cloud;
      };
      if (transport.session && transport.session.ensureIdToken) {
        transport.session.ensureIdToken().then(startCloud).catch(startCloud);
      } else {
        startCloud();
      }
    }
    waitDemo();
  }

  if (root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
