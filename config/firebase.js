/**
 * GitHub Pages 示範站內建雲端連線（milksha-qms-dev / s120030）。
 * Web API 金鑰為 Firebase 公開識別用；店別權限由 milksha-cloud devLogin 白名單控管（無存取碼）。
 * 部署時可由 scripts/inject-firebase-config.mjs 以 GitHub Actions secrets 覆寫 apiKey / posSignSecret。
 */
(function (root) {
  'use strict';
  root.MILKSHA_FIREBASE_CONFIG = {
    projectId: 'milksha-qms-dev',
    apiKey: 'fake-api-key-for-emulator',
    region: 'asia-east1',
    defaultCloudMode: true,
    boardPollIntervalMs: 2000,
    devicePollIntervalMs: 5000,
    heartbeatIntervalMs: 15000,
    firestoreEmulatorHost: '',
    functionsBaseUrl: '',
    identityToolkitBaseUrl: 'https://identitytoolkit.googleapis.com/v1',
    secureTokenBaseUrl: 'https://securetoken.googleapis.com/v1',
    posReceiverFunctionName: 'posReceiver',
    boxHeartbeatFunctionName: 'boxHeartbeat',
    boxUploadFunctionName: 'boxUpload',
    receiveLogsPathTemplate: 'stores/{storeId}/receive_logs',
    commandsPathTemplate: 'stores/{storeId}/commands',
    ingestEventsPathTemplate: 'stores/{storeId}/ingest_events',
    posSignSecret: 'fake-milksha-pos-sign-key-for-tests',
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
