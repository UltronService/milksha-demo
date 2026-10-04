/**
 * 非機密預設（API Key、存取碼請在控制端「雲端設定」填寫，勿提交至 Git）。
 */
(function (root) {
  'use strict';
  root.MILKSHA_FIREBASE_CONFIG = {
    projectId: '',
    apiKey: '',
    region: 'asia-east1',
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
    posSignSecret: '',
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
