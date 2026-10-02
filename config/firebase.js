/**
 * Firebase / 模擬器設定（可被網址參數與控制端連線區覆蓋）。
 */
(function (root) {
  'use strict';
  root.MILKSHA_FIREBASE_CONFIG = {
    projectId: 'milksha-qms-dev',
    apiKey: 'fake-api-key-for-emulator',
    region: 'asia-east1',
    boardPollIntervalMs: 2000,
    devicePollIntervalMs: 5000,
    heartbeatIntervalMs: 15000,
    firestoreEmulatorHost: 'localhost:8080',
    functionsBaseUrl: 'http://localhost:5001/milksha-qms-dev/asia-east1/',
    identityToolkitBaseUrl: 'http://localhost:9099/identitytoolkit.googleapis.com/v1',
    secureTokenBaseUrl: 'https://securetoken.googleapis.com/v1',
    posReceiverFunctionName: 'posReceiver',
    boxHeartbeatFunctionName: 'boxHeartbeat',
    boxUploadFunctionName: 'boxUpload',
    receiveLogsPathTemplate: 'stores/{storeId}/receive_logs',
    commandsPathTemplate: 'stores/{storeId}/commands',
    ingestEventsPathTemplate: 'stores/{storeId}/ingest_events',
    posSignSecret: 'dev-milksha-public-test-key-2026',
    defaultControllerAccessCode: 'dev-controller-access-2026',
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {});
