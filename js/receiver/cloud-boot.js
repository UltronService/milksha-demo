/**
 * Boot cloud/local sync on receiver-demo when ?mode=local|firestore|cloud
 */
(function (root) {
  'use strict';

  const AUTH_SLOW_RECHECK_MS = 10 * 60 * 1000;

  function readCreds(params) {
    const storeId = params.get('store') || 's120030';
    const deviceId = params.get('device') || root.localStorage.getItem('milksha:deviceId') || 'stb-01';
    const saved = root.QMS.Transport.CloudSettings.load();
    const code = saved.accessCode || '';
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

  function guestAuthDebugStage() {
    return root.document.getElementById('rcv-stage');
  }

  function setGuestAuthDebug(err) {
    const stage = guestAuthDebugStage();
    if (!stage) {
      return;
    }
    const status = err && err.status ? String(err.status) : '';
    const response = err && err.response ? err.response : null;
    const code =
      response && response.code != null
        ? String(response.code)
        : response && response.error != null
          ? String(response.error) // TODO: remove legacy `error` after milksha-cloud PR #4 deploy
          : '';
    const tag = code || status || 'auth';
    stage.setAttribute('data-auth-error', tag);
    if (code) {
      stage.setAttribute('data-auth-debug-code', code);
    } else {
      stage.removeAttribute('data-auth-debug-code');
    }
    if (status) {
      stage.setAttribute('data-auth-debug-status', status);
    } else {
      stage.removeAttribute('data-auth-debug-status');
    }
    try {
      root.console.warn('[receiver] auth failed (guest UI unchanged)', tag);
    } catch (e) {
      /* ignore */
    }
  }

  function clearGuestAuthDebug() {
    const stage = guestAuthDebugStage();
    if (!stage) {
      return;
    }
    stage.removeAttribute('data-auth-error');
    stage.removeAttribute('data-auth-debug-code');
    stage.removeAttribute('data-auth-debug-status');
    stage.removeAttribute('data-auth-stopped');
  }

  function setAuthStopped() {
    const stage = guestAuthDebugStage();
    if (stage) {
      stage.setAttribute('data-auth-stopped', '1');
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

    let authHalted = false;
    let auth401Retried = false;
    let slowRecheckTimer = null;

    function scheduleSlowAuthRecheck() {
      if (slowRecheckTimer) {
        return;
      }
      slowRecheckTimer = root.setTimeout(function () {
        slowRecheckTimer = null;
        authHalted = false;
        auth401Retried = false;
        if (transport.session && transport.session.resetAuthRetryState) {
          transport.session.resetAuthRetryState();
        }
        runEnsureIdToken();
      }, AUTH_SLOW_RECHECK_MS);
    }

    function handleAuthFailure(err) {
      setGuestAuthDebug(err);
      const status = err && err.status ? Number(err.status) : 0;
      const sessionStopped =
        transport.session && transport.session.isAuthStopped && transport.session.isAuthStopped();
      if (status === 403) {
        authHalted = true;
        setAuthStopped();
        return;
      }
      if (sessionStopped) {
        authHalted = true;
        setAuthStopped();
        scheduleSlowAuthRecheck();
        return;
      }
      if (status === 401) {
        if (!auth401Retried && transport.session && transport.session.clearStored) {
          auth401Retried = true;
          transport.session.clearStored();
          root.setTimeout(runEnsureIdToken, 0);
          return;
        }
        authHalted = true;
        setAuthStopped();
        scheduleSlowAuthRecheck();
      }
    }

    let ensureAuthInFlight = false;

    function runEnsureIdToken() {
      if (authHalted || ensureAuthInFlight) {
        return;
      }
      if (!transport.session || !transport.session.ensureIdToken) {
        return;
      }
      ensureAuthInFlight = true;
      transport.session
        .ensureIdToken()
        .then(function () {
          clearGuestAuthDebug();
        })
        .catch(function (err) {
          handleAuthFailure(err);
        })
        .finally(function () {
          ensureAuthInFlight = false;
        });
    }

    let cloudStarted = false;

    function waitDemo() {
      if (!root.receiverDemo) {
        root.setTimeout(waitDemo, 30);
        return;
      }
      const statusEl = root.document.getElementById('rcv-cloud-status');
      const startCloud = function () {
        if (cloudStarted) {
          return;
        }
        cloudStarted = true;
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
      startCloud();
      runEnsureIdToken();
    }
    waitDemo();
  }

  if (root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
