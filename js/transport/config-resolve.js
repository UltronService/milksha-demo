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
    const projectId = pickParam(params, 'project', saved.projectId || b.projectId || '');
    const apiKey = pickParam(params, 'key', saved.apiKey || b.apiKey || '');
    const region = pickParam(params, 'region', saved.region || b.region || 'asia-east1');
    const fakeGateway = pickParam(params, 'gateway', saved.gateway || b.fakeGatewayHost || '');
    const emulatorPrefix = pickParam(params, 'emulatorPrefix', saved.emulatorPrefix || b.emulatorPrefix || '');
    let firestoreEmulatorHost = pickParam(params, 'firestore', b.firestoreEmulatorHost || '');
    let functionsBaseUrl = pickParam(params, 'functions', b.functionsBaseUrl || '');
    let identityToolkitBaseUrl = pickParam(params, 'identity', b.identityToolkitBaseUrl || '');
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
      const merged = Object.assign({}, saved, {
        projectId: saved.projectId || pickParam(p, 'project', b.projectId || 'milksha-qms-dev'),
        apiKey: saved.apiKey || pickParam(p, 'key', b.apiKey || ''),
        gateway: saved.gateway || pickParam(p, 'gateway', ''),
        emulatorPrefix: saved.emulatorPrefix || pickParam(p, 'emulatorPrefix', ''),
        useEmulator: true,
      });
      if (merged.gateway) {
        const cfg = resolveFirebaseConfig(
          new URLSearchParams({
            project: merged.projectId,
            key: merged.apiKey,
            gateway: merged.gateway,
            emulatorPrefix: merged.emulatorPrefix || pickParam(p, 'emulatorPrefix', '__emulator'),
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
    const cfg =
      modeParam === 'cloud'
        ? resolveConfigForMode('cloud', params, baseConfig)
        : resolveFirebaseConfig(params, baseConfig);
    if (modeParam === 'firestore') {
      return { mode: 'firestore', config: cfg };
    }
    if (modeParam === 'cloud') {
      return { mode: 'cloud', config: cfg };
    }
    if (modeParam === 'local') {
      return { mode: 'local', config: cfg };
    }
    return { mode: 'local', config: cfg };
  }

  QMS.Transport.resolveFirebaseConfig = resolveFirebaseConfig;
  QMS.Transport.resolveModeFromUrl = resolveModeFromUrl;
  QMS.Transport.resolveConfigForMode = resolveConfigForMode;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
