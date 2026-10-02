/**
 * Merge MILKSHA_FIREBASE_CONFIG + URL params.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  function pickParam(params, key, fallback) {
    const v = params.get(key);
    return v !== null && v !== '' ? v : fallback;
  }

  /**
   * @param {URLSearchParams} params
   * @param {object} [base]
   */
  function resolveFirebaseConfig(params, base) {
    const b = base || root.MILKSHA_FIREBASE_CONFIG || {};
    const projectId = pickParam(params, 'project', b.projectId || 'milksha-qms-dev');
    const apiKey = pickParam(params, 'key', b.apiKey || '');
    const fakeGateway = pickParam(params, 'gateway', b.fakeGatewayHost || '');
    const emulatorPrefix = pickParam(params, 'emulatorPrefix', b.emulatorPrefix || '');
    let firestoreEmulatorHost = pickParam(params, 'firestore', b.firestoreEmulatorHost || '');
    let functionsBaseUrl = pickParam(params, 'functions', b.functionsBaseUrl || '');
    let identityToolkitBaseUrl = pickParam(params, 'identity', b.identityToolkitBaseUrl || '');
    let firestoreRestBase = '';
    if (fakeGateway) {
      const host = fakeGateway.replace(/^https?:\/\//, '');
      const prefix = emulatorPrefix ? '/' + emulatorPrefix.replace(/^\//, '').replace(/\/$/, '') : '';
      firestoreEmulatorHost = host;
      firestoreRestBase =
        'http://' + host.split('/')[0] + prefix + '/v1/projects/' + projectId + '/databases/(default)/documents';
      functionsBaseUrl =
        'http://' + host.split('/')[0] + prefix + '/fn/' + projectId + '/' + (b.region || 'asia-east1') + '/';
      identityToolkitBaseUrl = 'http://' + host.split('/')[0] + prefix + '/identity/v1';
    }
    return {
      projectId: projectId,
      apiKey: apiKey,
      region: b.region || 'asia-east1',
      boardPollIntervalMs: Number(pickParam(params, 'boardPoll', String(b.boardPollIntervalMs || 2000))),
      devicePollIntervalMs: Number(pickParam(params, 'devicePoll', String(b.devicePollIntervalMs || 5000))),
      heartbeatIntervalMs: Number(pickParam(params, 'heartbeat', String(b.heartbeatIntervalMs || 15000))),
      firestoreEmulatorHost: firestoreEmulatorHost,
      firestoreRestBase: firestoreRestBase,
      functionsBaseUrl: functionsBaseUrl,
      identityToolkitBaseUrl: identityToolkitBaseUrl,
      secureTokenBaseUrl: b.secureTokenBaseUrl || 'https://securetoken.googleapis.com/v1',
      posIngestFunctionName: b.posIngestFunctionName || 'posIngest',
      logsCollectionPathTemplate: b.logsCollectionPathTemplate || 'stores/{storeId}/logs',
      posSignSecret: b.posSignSecret || 'dev-public-fake-secret',
      useEmulator: Boolean(firestoreEmulatorHost),
    };
  }

  /**
   * @param {URLSearchParams} params
   * @param {object} baseConfig
   */
  function resolveModeFromUrl(params, baseConfig) {
    const modeParam = (params.get('mode') || '').toLowerCase();
    const cfg = resolveFirebaseConfig(params, baseConfig);
    if (modeParam === 'firestore') {
      return { mode: 'firestore', config: cfg };
    }
    if (modeParam === 'local') {
      return { mode: 'local', config: cfg };
    }
    return { mode: 'local', config: cfg };
  }

  QMS.Transport.resolveFirebaseConfig = resolveFirebaseConfig;
  QMS.Transport.resolveModeFromUrl = resolveModeFromUrl;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
