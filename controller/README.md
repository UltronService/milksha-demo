# 叫號看板控制端 `/controller/`

預設 **local** 模式（同一台電腦開看板 + 控制端即可 E2E）。

## 雲端函式（milksha-cloud）

| 函式 | 用途 |
|------|------|
| `devLogin` | 取得 custom token |
| `posReceiver` | 入口 A：POS 送單（Milksha Request + HMAC 簽章） |
| `boxHeartbeat` | 機上盒報平安 |
| `boxUpload` | 入口 B（保留） |
| `devCommand` | 遠端指令 |

## Firestore 路徑

- 看板：`stores/{storeId}/board/today_board`
- 裝置：`stores/{storeId}/devices/{deviceId}`
- 接收紀錄：`stores/{storeId}/receive_logs`
- 指令紀錄：`stores/{storeId}/commands`
- 入口 B 事件：`stores/{storeId}/ingest_events`

## 簽章（測試環境）

- 金鑰：`dev-milksha-public-test-key-2026`（`config/firebase.js` 可改）
- `Base64(HMAC-SHA256(key, merchant_id|account|timeStmp|serviceSpecialData_Json_Md5Hash))`

## 模擬器

見 [docs/EMULATOR.md](../docs/EMULATOR.md)。本機假雲端：`npm run fake-cloud`。
