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

  function defaultHomeBoardStoreId() {
    const Validate = root.QMS && root.QMS.Receiver && root.QMS.Receiver.Validate;
    if (Validate && Validate.DEFAULT_HOME_BOARD_STORE_ID) {
      return Validate.DEFAULT_HOME_BOARD_STORE_ID;
    }
    return 'c030020';
  }

  function clearOtherReceiverCaches(activeStoreId) {
    const keep = String(activeStoreId || '').trim();
    if (!keep) {
      return;
    }
    const prefix = 'milksha:receiver-cache:';
    try {
      const storage = root.localStorage;
      if (!storage || !storage.key) {
        return;
      }
      const remove = [];
      for (let i = 0; ; i += 1) {
        const key = storage.key(i);
        if (!key) {
          break;
        }
        if (key.indexOf(prefix) === 0 && key !== prefix + keep) {
          remove.push(key);
        }
      }
      for (let j = 0; j < remove.length; j += 1) {
        storage.removeItem(remove[j]);
      }
    } catch (e) {
      /* ignore */
    }
  }

  function readCreds(params, transportMode) {
    const home = isHomeBoardPage();
    const storeParam = params.get('store');
    const deviceParam = params.get('device');
    let storeId = storeParam || 's120030';
    let deviceId = deviceParam || root.localStorage.getItem('milksha:deviceId') || 'stb-01';
    if (home) {
      if (!storeParam) {
        storeId = defaultHomeBoardStoreId();
      }
      if (!deviceParam) {
        deviceId = 'stb-01';
        try {
          root.localStorage.setItem('milksha:deviceId', deviceId);
        } catch (e) {
          /* ignore */
        }
      }
    }
    if (params.get('device')) {
      root.localStorage.setItem('milksha:deviceId', deviceId);
    }
    return { storeId: storeId, deviceId: deviceId };
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
    return root.document.getElementById('board-root') || root.document.getElementById('rcv-stage');
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

  function readLoadedBuildTag() {
    const scripts = root.document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i += 1) {
      const src = scripts[i].src || '';
      const match = src.match(/cloud-boot\.js\?v=([^&]+)/);
      if (match) {
        return match[1];
      }
    }
    return '';
  }

  function scheduleHomeBuildVersionCheck() {
    const loadedBuild = readLoadedBuildTag();
    if (!loadedBuild) {
      return;
    }
    let checkTimer = null;
    function checkRemoteBuild() {
      const path = root.location.pathname || '/';
      const url = path + (path.indexOf('?') >= 0 ? '&' : '?') + '_buildProbe=' + Date.now();
      root
        .fetch(url, { cache: 'no-store' })
        .then(function (res) {
          return res.text();
        })
        .then(function (html) {
          const match = html.match(/cloud-boot\.js\?v=([^"'&]+)/);
          if (!match || match[1] === loadedBuild) {
            return;
          }
          const remoteBuild = match[1];
          if (root.QMS && root.QMS.runtime && typeof root.QMS.runtime.isAnnouncing === 'function') {
            if (root.QMS.runtime.isAnnouncing()) {
              return;
            }
          }
          try {
            const reloadedFor = root.sessionStorage.getItem('milksha:build-reloaded-for');
            if (reloadedFor === remoteBuild) {
              return;
            }
            root.sessionStorage.setItem('milksha:build-reloaded-for', remoteBuild);
          } catch (e) {
            /* ignore */
          }
          root.location.reload();
        })
        .catch(function () {
          /* ignore */
        });
    }
    checkTimer = root.setInterval(checkRemoteBuild, 180000);
    root.addEventListener('beforeunload', function () {
      if (checkTimer) {
        root.clearInterval(checkTimer);
      }
    });
  }

  function attachLocalSyncListeners(resolveStoreId, cloud, options) {
    const localModeOnly = options && options.localModeOnly;
    function kick() {
      if (cloud.triggerBoardPoll) {
        cloud.triggerBoardPoll();
      }
      if (cloud.triggerDevicePoll) {
        cloud.triggerDevicePoll();
      }
    }
    let channel = null;
    function ensureChannel() {
      const storeId = resolveStoreId();
      const channelName = 'milksha-transport:' + storeId;
      if (channel && channel.__milkshaStoreId === storeId) {
        return;
      }
      if (channel) {
        channel.close();
      }
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(channelName);
        channel.__milkshaStoreId = storeId;
        channel.onmessage = function (ev) {
          const msg = ev.data;
          if (msg && msg.storeId === resolveStoreId()) {
            kick();
          }
        };
      }
    }
    ensureChannel();
    root.addEventListener('storage', function (ev) {
      if (!ev.key || ev.key.indexOf('milksha:local:') !== 0) {
        return;
      }
      ensureChannel();
      const storeId = resolveStoreId();
      if (ev.key.indexOf(':board:' + storeId) >= 0 || ev.key.indexOf(':device:' + storeId) >= 0) {
        kick();
      }
      if (localModeOnly && ev.key === 'milksha:local:poc-target') {
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
    const homeBoard = isHomeBoardPage();
    let mode = (params.get('mode') || '').toLowerCase();
    if (!mode && homeBoard) {
      const preferCloud =
        QMS.Transport.CloudSettings.prefersDefaultCloudMode &&
        QMS.Transport.CloudSettings.prefersDefaultCloudMode();
      mode = preferCloud ? 'cloud' : 'local';
    }
    if (!homeBoard && mode !== 'local' && mode !== 'firestore' && mode !== 'cloud') {
      return;
    }

    if (mode === 'cloud' && !QMS.Transport.CloudSettings.isBundledCloudReady()) {
      if (homeBoard) {
        mode = 'local';
      } else {
        showSetupGate(true);
        return;
      }
    }

    if (mode !== 'local' && mode !== 'firestore' && mode !== 'cloud') {
      return;
    }

    const modeResolved = QMS.Transport.resolveModeFromUrl(params, root.MILKSHA_FIREBASE_CONFIG || {});
    if (mode === 'cloud' && !modeResolved.config) {
      if (homeBoard) {
        mode = 'local';
      } else {
        showSetupGate(true);
        return;
      }
    }

    if (mode === 'local') {
      modeResolved.mode = 'local';
      modeResolved.config = QMS.Transport.resolveConfigForMode(
        'local',
        params,
        root.MILKSHA_FIREBASE_CONFIG || {},
      );
    }

    showSetupGate(false);
    const transportMode = mode === 'cloud' ? 'cloud' : mode === 'firestore' ? 'firestore' : 'local';
    const creds = readCreds(params, transportMode);
    if (homeBoard && transportMode === 'cloud') {
      clearOtherReceiverCaches(creds.storeId);
      try {
        root.localStorage.removeItem('milksha:receiver-cache:' + creds.storeId);
      } catch (e) {
        /* ignore */
      }
    }
    const transport = QMS.Transport.createTransport(transportMode, {
      storeId: creds.storeId,
      config: modeResolved.config,
      role: 'device',
      deviceId: creds.deviceId,
      homeBoard: homeBoard,
      onAuthSuccess: function () {
        clearGuestAuthDebug();
      },
    });

    function resolveHomeLocalStoreId() {
      if (transportMode === 'cloud') {
        return creds.storeId;
      }
      const Coord = QMS.Transport.LocalPocCoord;
      if (Coord && homeBoard) {
        return Coord.resolveLocalDeviceContext(root.localStorage, {
          homeBoard: true,
          fallbackStoreId: creds.storeId,
          fallbackDeviceId: creds.deviceId,
        }).storeId;
      }
      return creds.storeId;
    }

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
        if (transport.session && transport.session.prepareScheduledAuthRecheck) {
          transport.session.prepareScheduledAuthRecheck();
        } else if (transport.session && transport.session.resetAuthRetryState) {
          transport.session.resetAuthRetryState();
        }
        if (transport.session && transport.session.clearUploadHalt) {
          transport.session.clearUploadHalt();
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
        if (root.receiverCloud && root.receiverCloud.refreshGuestCloudStatus) {
          root.receiverCloud.refreshGuestCloudStatus();
        }
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
          if (root.receiverCloud && root.receiverCloud.scheduleCloudResync) {
            root.receiverCloud.scheduleCloudResync('auth');
          }
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
        showCloudOfflineUi: Boolean(homeBoard && milkshaRuntime),
        skipBootReceiverCache: Boolean(homeBoard && transportMode === 'cloud'),
        onCloudResync: function () {
          if (transport.session && transport.session.refreshIdToken) {
            return transport.session
              .refreshIdToken()
              .catch(function () {
                return runEnsureIdToken(true);
              })
              .then(function () {
                if (cloud.triggerBoardPoll) {
                  cloud.triggerBoardPoll({ force: true });
                }
                if (cloud.triggerDevicePoll) {
                  cloud.triggerDevicePoll();
                }
                if (cloud.sendHeartbeat) {
                  cloud.sendHeartbeat();
                }
              });
          }
          return runEnsureIdToken(true).then(function () {
            if (cloud.triggerBoardPoll) {
              cloud.triggerBoardPoll({ force: true });
            }
            if (cloud.triggerDevicePoll) {
              cloud.triggerDevicePoll();
            }
            if (cloud.sendHeartbeat) {
              cloud.sendHeartbeat();
            }
          });
        },
      });
      cloud.start();
      root.receiveBoard = cloud.receiveBoard;
      root.receiverCloud = cloud;
      if (mode === 'local' && homeBoard) {
        let localKeepaliveTimer = null;
        function localKeepalivePulse() {
          if (cloud.sendHeartbeat) {
            cloud.sendHeartbeat();
          }
        }
        localKeepalivePulse();
        localKeepaliveTimer = root.setInterval(localKeepalivePulse, 45000);
        root.addEventListener('storage', function (ev) {
          if (!ev.key) {
            return;
          }
          const boardPrefix = 'milksha:local:board:' + resolveHomeLocalStoreId();
          if (ev.key.indexOf(boardPrefix) === 0) {
            localKeepalivePulse();
          }
        });
        root.addEventListener('beforeunload', function () {
          if (localKeepaliveTimer) {
            root.clearInterval(localKeepaliveTimer);
          }
        });
        if (root.document && root.document.addEventListener) {
          root.document.addEventListener('visibilitychange', localKeepalivePulse);
        }
        const Coord = QMS.Transport.LocalPocCoord;
        if (Coord && Coord.subscribeLocalPocTarget) {
          Coord.subscribeLocalPocTarget(function () {
            localKeepalivePulse();
            if (cloud.triggerBoardPoll) {
              cloud.triggerBoardPoll();
            }
          });
        }
        scheduleHomeBuildVersionCheck();
      }
      if (milkshaRuntime) {
        attachLocalSyncListeners(resolveHomeLocalStoreId, cloud, {
          localModeOnly: transportMode === 'local',
        });
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
