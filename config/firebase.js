/**
 * Firebase / 模擬器設定（可被網址參數與控制端連線區覆蓋）。
 * 正式 projectId / apiKey 待後端提供。
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
    /** Firestore REST：模擬器 localhost:8080；假雲端測試可改為單一 gateway */
    firestoreEmulatorHost: 'localhost:8080',
    /** 雲端函式基底，結尾含 / */
    functionsBaseUrl: 'http://localhost:5001/milksha-qms-dev/asia-east1/',
    /** Identity Toolkit REST 基底（含 /v1） */
    identityToolkitBaseUrl: 'http://localhost:9099/identitytoolkit.googleapis.com/v1',
    secureTokenBaseUrl: 'https://securetoken.googleapis.com/v1',
    /** 可設定：POS 入口函式名、紀錄集合路徑 */
    posIngestFunctionName: 'posIngest',
    logsCollectionPathTemplate: 'stores/{storeId}/logs',
    /** 測試用簽章假金鑰（算法待 milksha-cloud README） */
    posSignSecret: 'dev-public-fake-secret',
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {});
