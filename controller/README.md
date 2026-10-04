# 叫號看板控制端 `/controller/`

預設 **local** 模式（同一台電腦開看板 + 控制端即可 E2E）。

## 雲端函式（milksha-cloud）

| 函式 | 用途 |
|------|------|
| `devLogin` | 取得 custom token |
| `posReceiver` | 入口 A：POS 送單（Milksha Request + HMAC 簽章） |
| `boxHeartbeat` | 機上盒報平安 |
| `boxUpload` | 入口 B（僅真實 milksha-cloud；本 repo 假雲端**未**實作） |
| `devCommand` | 遠端指令 |

## Firestore 路徑

- 看板：`stores/{storeId}/board/today_board`
- 裝置：`stores/{storeId}/devices/{deviceId}`
- 接收紀錄：`stores/{storeId}/receive_logs`
- 指令紀錄：`stores/{storeId}/commands`
- 入口 B 事件：`stores/{storeId}/ingest_events`

## 簽章（測試環境）

- POS 金鑰：僅在控制頁「測試環境專用 POS 金鑰」輸入，存於瀏覽器 localStorage（勿提交 Git、勿放入看板 `#cfg=` 連結）
- 驗證與簽名規則見 [docs/entry-a-pos-api.md](../docs/entry-a-pos-api.md)（與 milksha-cloud 入口 A 一致）

## 看板設定連結

「產生看板連結」輸出 `#cfg=` URL（含存取碼）。看板讀取後存本機並清除 hash。測試環境由工程人員私下交 Android 工程師用 Ultron APK 裝進機上盒；詳見 [docs/EMULATOR.md](../docs/EMULATOR.md)。

## 模擬器

見 [docs/EMULATOR.md](../docs/EMULATOR.md)。本機假雲端：`npm run fake-cloud`。
