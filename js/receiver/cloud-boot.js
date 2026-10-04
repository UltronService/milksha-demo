/**
 * Boot cloud/local sync on receiver-demo when ?mode=local|firestore|cloud
 */
(function (root) {
  'use strict';

  function devTestHooksAllowed() {
    const QMS = root.QMS;
    if (!QMS || !QMS.Transport || !QMS.Transport.isDevEndpointOverrideAllowed) {
      return false;
    }
    return QMS.Transport.isDevEndpointOverrideAllowed();
  }

  function authSlowRecheckMs(params) {
    if (!devTestHooksAllowed()) {
      return 10 * 60 * 1000;
    }
    const testMs = Number(params.get('testAuthRecheckMs'));
    if (Number.isFinite(testMs) && testMs >= 100) {
      return testMs;
    }
    return 10 * 60 * 1000;
  }

  function auth403RecheckMs(params) {
    if (!devTestHooksAllowed()) {
      return 5 * 60 * 1000;
    }
    const testMs = Number(params.get('testAuthRecheckMs'));
    if (Number.isFinite(testMs) && testMs >= 100) {
      return testMs;
    }
    return 5 * 60 * 1000;
  }

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
    const code = response && response.code != null ? String(response.code) : '';
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
    stage.removeAttribute('data-upload-stopped');
  }

  function setUploadStopped() {
    const stage = guestAuthDebugStage();
    if (stage) {
      stage.setAttribute('data-upload-stopped', '1');
    }
  }

  function setAuthStopped() {
    const stage = guestAuthDebugStage();
    if (stage) {
      stage.setAttribute('data-auth-stopped', '1');
    }
  }

  function isHomeBoardPage() {
    return Boolean(root.document.getElementById('board-root'));
  }

  function attachLocalSyncListeners(storeId, cloud) {
    function kick() {
      if (cloud.triggerBoardPoll) {
        cloud.triggerBoardPoll();
      }
      if (cloud.triggerDevicePoll) {
        cloud.triggerDevicePoll();
      }
    }
    const channelName = 'milksha-transport:' + storeId;
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(channelName);
      ch.onmessage = function (ev) {
        const msg = ev.data;
        if (msg && msg.storeId === storeId) {
          kick();
        }
      };
    }
    root.addEventListener('storage', function (ev) {
      if (!ev.key || ev.key.indexOf('milksha:local:') !== 0) {
        return;
      }
      if (ev.key.indexOf(':board:' + storeId) >= 0 || ev.key.indexOf(':device:' + storeId) >= 0) {
        kick();
      }
    });
  }

  function boot() {
    const QMS = root.QMS;
    if (!QMS || !QMS.Transport || !QMS.Receiver) {
      return;
    }
    QMS.Transport.CloudSettings.applyHashImport();

    const params = new URLSearchParams(root.location.search);
    let mode = (params.get('mode') || '').toLowerCase();
    if (!mode && isHomeBoardPage()) {
      mode = 'local';
    }
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
      onAuthSuccess: function () {
        clearGuestAuthDebug();
      },
    });

    let authHalted = false;
    let auth401Retried = false;
    let slowRecheckTimer = null;
    let pendingRecheckDelayMs = authSlowRecheckMs(params);
    const slowRecheckMs = authSlowRecheckMs(params);
    const recheck403Ms = auth403RecheckMs(params);

    if (devTestHooksAllowed()) {
      root.__forceReceiverAuthRecheck = function (opts) {
        const options = opts && typeof opts === 'object' ? opts : {};
        authHalted = false;
        if (slowRecheckTimer) {
          root.clearTimeout(slowRecheckTimer);
          slowRecheckTimer = null;
        }
        if (options.clearSession && transport.session && transport.session.clearStored) {
          transport.session.clearStored();
        }
        runEnsureIdToken();
      };
      root.__receiverEnsureIdTokenForTests = function () {
        return runEnsureIdToken(true);
      };
      root.__receiverAttemptDevLoginForTests = function () {
        if (!transport.session || !transport.session.devLogin) {
          return Promise.resolve();
        }
        authHalted = false;
        return transport.session
          .devLogin()
          .then(function () {
            if (transport.session && transport.session.resetAuthRetryState) {
              transport.session.resetAuthRetryState();
            }
            if (transport.session && transport.session.clearUploadHalt) {
              transport.session.clearUploadHalt();
            }
            clearGuestAuthDebug();
          })
          .catch(function (err) {
            handleAuthFailure(err);
          });
      };
    }

    function scheduleSlowAuthRecheck(delayMs) {
      if (slowRecheckTimer) {
        root.clearTimeout(slowRecheckTimer);
        slowRecheckTimer = null;
      }
      const waitMs =
        Number.isFinite(delayMs) && delayMs >= 100 ? delayMs : pendingRecheckDelayMs;
      slowRecheckTimer = root.setTimeout(function () {
        slowRecheckTimer = null;
        authHalted = false;
        auth401Retried = false;
        if (transport.session && transport.session.resetAuthRetryState) {
          transport.session.resetAuthRetryState();
        }
        runEnsureIdToken(true);
      }, waitMs);
    }

    function syncAuthUiFromSession() {
      if (!transport.session) {
        return;
      }
      const halted =
        transport.session.isUploadHalted && transport.session.isUploadHalted();
      const stopped =
        transport.session.isAuthStopped && transport.session.isAuthStopped();
      if (!halted && !stopped) {
        clearGuestAuthDebug();
      }
    }

    function handleAuthFailure(err) {
      setGuestAuthDebug(err);
      const status = err && err.status ? Number(err.status) : 0;
      const sessionStopped =
        transport.session && transport.session.isAuthStopped && transport.session.isAuthStopped();
      if (status === 403) {
        setUploadStopped();
        pendingRecheckDelayMs = recheck403Ms;
        scheduleSlowAuthRecheck(recheck403Ms);
        return;
      }
      if (sessionStopped) {
        authHalted = true;
        setAuthStopped();
        pendingRecheckDelayMs = slowRecheckMs;
        scheduleSlowAuthRecheck(slowRecheckMs);
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
        pendingRecheckDelayMs = slowRecheckMs;
        scheduleSlowAuthRecheck(slowRecheckMs);
      }
    }

    let ensureAuthInFlight = false;
    /** @type {Promise<void>|null} */
    let ensureAuthPromise = null;

    function runEnsureIdToken(forceRetry) {
      if (ensureAuthInFlight && ensureAuthPromise) {
        return ensureAuthPromise;
      }
      if (authHalted && !forceRetry) {
        return Promise.resolve();
      }
      if (!transport.session || !transport.session.ensureIdToken) {
        return Promise.resolve();
      }
      ensureAuthInFlight = true;
      ensureAuthPromise = transport.session
        .ensureIdToken()
        .then(function () {
          authHalted = false;
          auth401Retried = false;
          if (slowRecheckTimer) {
            root.clearTimeout(slowRecheckTimer);
            slowRecheckTimer = null;
          }
          if (transport.session && transport.session.resetAuthRetryState) {
            transport.session.resetAuthRetryState();
          }
          if (transport.session && transport.session.clearUploadHalt) {
            transport.session.clearUploadHalt();
          }
          clearGuestAuthDebug();
          syncAuthUiFromSession();
        })
        .catch(function (err) {
          handleAuthFailure(err);
        })
        .finally(function () {
          ensureAuthInFlight = false;
          ensureAuthPromise = null;
        });
      return ensureAuthPromise;
    }

    let cloudStarted = false;
    const statusEl = root.document.getElementById('rcv-cloud-status');

    function startCloudRuntime(milkshaRuntime) {
      if (cloudStarted) {
        return;
      }
      cloudStarted = true;
      const devHooks = devTestHooksAllowed();
      const testDevicePollMs = devHooks ? Number(params.get('testDevicePollMs')) : NaN;
      const testHeartbeatMs = devHooks ? Number(params.get('testHeartbeatMs')) : NaN;
      const enableTestPollHook = devHooks && params.has('testDevicePollMs');
      if (enableTestPollHook) {
        root.__receiverAuthBlockedForTests = function () {
          return Boolean(
            transport.session &&
              transport.session.isAuthStopped &&
              transport.session.isAuthStopped(),
          );
        };
      }
      const cloud = QMS.Receiver.bootReceiverCloud({
        storeId: creds.storeId,
        deviceId: creds.deviceId,
        transport: transport,
        receiverDemo: milkshaRuntime ? null : root.receiverDemo,
        milkshaRuntime: milkshaRuntime || null,
        enableTestPollHook: enableTestPollHook,
        enableTestReloadSpy: enableTestPollHook,
        boardPollIntervalMs: modeResolved.config.boardPollIntervalMs,
        devicePollIntervalMs:
          Number.isFinite(testDevicePollMs) && testDevicePollMs >= 200
            ? testDevicePollMs
            : modeResolved.config.devicePollIntervalMs,
        heartbeatIntervalMs:
          Number.isFinite(testHeartbeatMs) && testHeartbeatMs >= 200
            ? testHeartbeatMs
            : modeResolved.config.heartbeatIntervalMs,
        onStatusLine: function (line) {
          if (statusEl) {
            statusEl.textContent = line;
          }
        },
        onAuthFailure: handleAuthFailure,
        onSyncAuthUi: syncAuthUiFromSession,
      });
      cloud.start();
      root.receiveBoard = cloud.receiveBoard;
      root.receiverCloud = cloud;
      if (milkshaRuntime) {
        attachLocalSyncListeners(creds.storeId, cloud);
      }
    }

    function waitBoardSurface() {
      const homeBoard = isHomeBoardPage();
      if (homeBoard) {
        if (!root.QMS || !root.QMS.runtime || typeof root.QMS.runtime.applyPayload !== 'function') {
          root.setTimeout(waitBoardSurface, 30);
          return;
        }
        startCloudRuntime(root.QMS.runtime);
        runEnsureIdToken();
        return;
      }
      if (!root.receiverDemo) {
        root.setTimeout(waitBoardSurface, 30);
        return;
      }
      startCloudRuntime(null);
      runEnsureIdToken();
    }
    waitBoardSurface();
  }

  if (root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
