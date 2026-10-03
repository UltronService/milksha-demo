/**
 * Boot cloud/local sync on receiver-demo when ?mode=local|firestore|cloud
 */
(function (root) {
  'use strict';

  function readCreds(params) {
    const storeId = params.get('store') || 's120030';
    const deviceId = params.get('device') || root.localStorage.getItem('milksha:deviceId') || 'stb-01';
    const saved = root.QMS.Transport.CloudSettings.load();
    const code = saved.accessCode || root.localStorage.getItem('milksha:accessCode') || '';
    if (params.get('device')) {
      root.localStorage.setItem('milksha:deviceId', deviceId);
    }
    return { storeId: storeId, deviceId: deviceId, accessCode: code };
  }

  function showSetupGate(show) {
    const gate = root.document.getElementById('rcv-setup-gate');
    const stage = root.document.getElementById('rcv-stage');
    if (gate) {
      gate.hidden = !show;
    }
    if (stage) {
      stage.hidden = show;
    }
  }

  function boot() {
    const QMS = root.QMS;
    if (!QMS || !QMS.Transport || !QMS.Receiver) {
      return;
    }
    QMS.Transport.CloudSettings.applyHashImport();

    const params = new URLSearchParams(root.location.search);
    const mode = (params.get('mode') || '').toLowerCase();
    if (mode !== 'local' && mode !== 'firestore' && mode !== 'cloud') {
      return;
    }

    if (mode === 'cloud' && !QMS.Transport.CloudSettings.isComplete()) {
      showSetupGate(true);
      return;
    }

    const modeResolved = QMS.Transport.resolveModeFromUrl(params, root.MILKSHA_FIREBASE_CONFIG || {});
    if (mode === 'cloud' && !modeResolved.config) {
      showSetupGate(true);
      return;
    }

    showSetupGate(false);
    const creds = readCreds(params);
    const transportMode = modeResolved.mode === 'cloud' ? 'cloud' : modeResolved.mode;
    const transport = QMS.Transport.createTransport(transportMode, {
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
        transport.session.ensureIdToken().then(startCloud).catch(function () {
          showSetupGate(true);
        });
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
