/**
 * Merge MILKSHA_FIREBASE_CONFIG + URL params + saved cloud settings.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};
  const CloudSettings = QMS.Transport.CloudSettings;

  function pickParam(params, key, fallback) {
    const v = params.get(key);
    return v !== null && v !== '' ? v : fallback;
  }

  function isDevEndpointOverrideAllowed() {
    try {
      const loc = root.location;
      if (!loc) {
        return false;
      }
      const host = String(loc.hostname || '');
      if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
        return true;
      }
      const b = root.MILKSHA_FIREBASE_CONFIG || {};
      if (b.allowUrlEndpointOverrides) {
        return true;
      }
      if (b.fakeGatewayHost) {
        return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  function pickDevEndpointParam(params, key, fallback) {
    if (!isDevEndpointOverrideAllowed()) {
      return fallback;
    }
    return pickParam(params, key, fallback);
  }

  function sharedTiming(base) {
    const b = base || {};
    return {
      boardPollIntervalMs: Number(b.boardPollIntervalMs || 2000),
      devicePollIntervalMs: Number(b.devicePollIntervalMs || 5000),
      heartbeatIntervalMs: Number(b.heartbeatIntervalMs || 15000),
      posReceiverFunctionName: b.posReceiverFunctionName || 'posReceiver',
      boxHeartbeatFunctionName: b.boxHeartbeatFunctionName || 'boxHeartbeat',
      boxUploadFunctionName: b.boxUploadFunctionName || 'boxUpload',
      receiveLogsPathTemplate: b.receiveLogsPathTemplate || 'stores/{storeId}/receive_logs',
      commandsPathTemplate: b.commandsPathTemplate || 'stores/{storeId}/commands',
      ingestEventsPathTemplate: b.ingestEventsPathTemplate || 'stores/{storeId}/ingest_events',
      posSignSecret: b.posSignSecret || '',
      secureTokenBaseUrl: b.secureTokenBaseUrl || 'https://securetoken.googleapis.com/v1',
    };
  }

  function applyEmulatorGateway(cfg, fakeGateway, emulatorPrefix, projectId, region) {
    const host = fakeGateway.replace(/^https?:\/\//, '');
    const prefix = emulatorPrefix ? '/' + emulatorPrefix.replace(/^\//, '').replace(/\/$/, '') : '';
    cfg.firestoreEmulatorHost = host;
    cfg.firestoreRestBase =
      'http://' + host.split('/')[0] + prefix + '/v1/projects/' + projectId + '/databases/(default)/documents';
    cfg.functionsBaseUrl =
      'http://' + host.split('/')[0] + prefix + '/fn/' + projectId + '/' + region + '/';
    cfg.identityToolkitBaseUrl = 'http://' + host.split('/')[0] + prefix + '/identity/v1';
    cfg.useEmulator = true;
  }

  /**
   * @param {URLSearchParams} params
   * @param {object} [base]
   */
  function resolveFirebaseConfig(params, base) {
    const b = base || root.MILKSHA_FIREBASE_CONFIG || {};
    const saved = CloudSettings ? CloudSettings.load() : {};
    const projectId = pickDevEndpointParam(params, 'project', saved.projectId || b.projectId || '');
    const apiKey = pickDevEndpointParam(params, 'key', saved.apiKey || b.apiKey || '');
    const region = pickDevEndpointParam(params, 'region', saved.region || b.region || 'asia-east1');
    const fakeGateway = pickDevEndpointParam(params, 'gateway', saved.gateway || b.fakeGatewayHost || '');
    const emulatorPrefix = pickDevEndpointParam(
      params,
      'emulatorPrefix',
      saved.emulatorPrefix || b.emulatorPrefix || '',
    );
    let firestoreEmulatorHost = pickDevEndpointParam(params, 'firestore', b.firestoreEmulatorHost || '');
    let functionsBaseUrl = pickDevEndpointParam(params, 'functions', b.functionsBaseUrl || '');
    let identityToolkitBaseUrl = pickDevEndpointParam(params, 'identity', b.identityToolkitBaseUrl || '');
    let firestoreRestBase = '';
    let useEmulator = false;

    if (fakeGateway) {
      const cfg = {
        projectId: projectId,
        apiKey: apiKey,
        region: region,
        firestoreEmulatorHost: '',
        firestoreRestBase: '',
        functionsBaseUrl: '',
        identityToolkitBaseUrl: '',
        useEmulator: false,
      };
      applyEmulatorGateway(cfg, fakeGateway, emulatorPrefix, projectId, region);
      return Object.assign(sharedTiming(b), cfg);
    }

    if (!functionsBaseUrl && projectId) {
      const prod = CloudSettings.productionEndpoints(projectId, region);
      functionsBaseUrl = prod.functionsBaseUrl;
      firestoreRestBase = prod.firestoreRestBase;
      identityToolkitBaseUrl = prod.identityToolkitBaseUrl;
    }

    return Object.assign(sharedTiming(b), {
      projectId: projectId,
      apiKey: apiKey,
      region: region,
      firestoreEmulatorHost: firestoreEmulatorHost,
      firestoreRestBase: firestoreRestBase,
      functionsBaseUrl: functionsBaseUrl,
      identityToolkitBaseUrl: identityToolkitBaseUrl,
      useEmulator: useEmulator,
      defaultControllerAccessCode: b.defaultControllerAccessCode || '',
    });
  }

  /**
   * Build config for transport factory from UI mode.
   * @param {'local'|'firestore'|'cloud'} mode
   * @param {URLSearchParams} [params]
   * @param {object} [baseConfig]
   */
  function resolveConfigForMode(mode, params, baseConfig) {
    const b = baseConfig || root.MILKSHA_FIREBASE_CONFIG || {};
    const p = params || new URLSearchParams(root.location.search);
    const saved = CloudSettings.load();

    if (mode === 'cloud') {
      if (!CloudSettings.isComplete(saved)) {
        return null;
      }
      const prod = CloudSettings.productionEndpoints(saved.projectId, saved.region);
      return Object.assign(sharedTiming(b), {
        projectId: saved.projectId,
        apiKey: saved.apiKey,
        region: saved.region || 'asia-east1',
        functionsBaseUrl: prod.functionsBaseUrl,
        firestoreRestBase: prod.firestoreRestBase,
        identityToolkitBaseUrl: prod.identityToolkitBaseUrl,
        firestoreEmulatorHost: '',
        useEmulator: false,
      });
    }

    if (mode === 'local') {
      return resolveFirebaseConfig(p, b);
    }

    if (mode === 'firestore') {
      const devOverrides = isDevEndpointOverrideAllowed();
      const merged = Object.assign({}, saved, {
        projectId: saved.projectId || pickDevEndpointParam(p, 'project', b.projectId || 'milksha-qms-dev'),
        apiKey: saved.apiKey || pickDevEndpointParam(p, 'key', b.apiKey || ''),
        gateway: devOverrides ? saved.gateway || pickParam(p, 'gateway', '') : saved.gateway || '',
        emulatorPrefix: devOverrides
          ? saved.emulatorPrefix || pickParam(p, 'emulatorPrefix', '')
          : saved.emulatorPrefix || '',
        useEmulator: true,
      });
      if (merged.gateway) {
        const cfg = resolveFirebaseConfig(
          new URLSearchParams({
            project: merged.projectId,
            key: merged.apiKey,
            gateway: merged.gateway,
            emulatorPrefix: merged.emulatorPrefix || pickDevEndpointParam(p, 'emulatorPrefix', '__emulator'),
          }),
          b,
        );
        return cfg;
      }
      return resolveFirebaseConfig(p, b);
    }

    return resolveFirebaseConfig(p, b);
  }

  /**
   * @param {URLSearchParams} params
   * @param {object} baseConfig
   */
  function resolveModeFromUrl(params, baseConfig) {
    const modeParam = (params.get('mode') || '').toLowerCase();
    const effectiveMode =
      modeParam === 'firestore' && !isDevEndpointOverrideAllowed() ? 'local' : modeParam;
    const cfg =
      effectiveMode === 'cloud'
        ? resolveConfigForMode('cloud', params, baseConfig)
        : effectiveMode === 'firestore'
          ? resolveConfigForMode('firestore', params, baseConfig)
          : resolveFirebaseConfig(params, baseConfig);
    if (effectiveMode === 'firestore') {
      return { mode: 'firestore', config: cfg };
    }
    if (effectiveMode === 'cloud') {
      return { mode: 'cloud', config: cfg };
    }
    if (effectiveMode === 'local') {
      return { mode: 'local', config: cfg };
    }
    return { mode: 'local', config: cfg };
  }

  QMS.Transport.resolveFirebaseConfig = resolveFirebaseConfig;
  QMS.Transport.resolveModeFromUrl = resolveModeFromUrl;
  QMS.Transport.resolveConfigForMode = resolveConfigForMode;
  QMS.Transport.isDevEndpointOverrideAllowed = isDevEndpointOverrideAllowed;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
