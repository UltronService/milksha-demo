# Controller no-poll — 實作報告

## 變更摘要

- 雲端／Firestore 模式：移除 `startPolling` 每 4 秒 REST 讀取 `today_board` 與 `devices/{deviceId}`，改為 `controller-realtime-sync.js` 的 Firestore `onSnapshot`。
- 斷線：顯示 `#realtime-disconnect-banner`（`data-testid="realtime-disconnect-banner"`），指數退避重掛；重連成功後各文件 **一次** `get()`（`forceRefetch`）。
- **未改** 30 秒 `listStores` 輪詢。
- Local 模式仍使用 `startLocalPolling()`（4s，本機 POC，非雲端 Firestore 計費路徑）。

## 讀取次數（同一情境：單頁已連線、idle 60 分鐘、無叫號）

| 指標 | 改前 | 改後 | 量測方法 |
|------|------|------|----------|
| Firestore document reads（`today_board` + `devices/{deviceId}`） | **≈ 1,800 / 小時**（900 次 × 2 GET） | **≈ 2（初次 snapshot）+ 0（無資料變更）** | 理論：週期 4s → `3600/4×2`；改後無 steady-state REST。實測可在連線後讀 `window.__controller.getCloudRealtimeStats().readCounts`（board/device 為 snapshot 次數，refetch 僅重連補讀）並在 DevTools Network 過濾 `firestore.googleapis.com` GET，idle 60s 應無週期性 GET。 |
| `listStores` HTTP | ≈ 120 / 小時（30s） | 同左 | 未變更。 |

## 新增／更新測試

| 檔案 | 說明 |
|------|------|
| `tests/controller-polling.test.js` | 雲端走 `startCloudRealtimeSync`；local 保留 `startLocalPolling` |
| `tests/controller-realtime-sync.test.js` | board snapshot 更新、`onRealtimeState` 斷線與重連補讀 |

## CI

- **PR CI run**：（push 後填入 Actions URL）
- **Head commit**：（push 後填入）
- **與 main baseline 38 失敗對照**：`artifacts/ci-nightly/main-baseline-failures-39105020723.txt` — PR 新增失敗須為 **0**（允許與 baseline 重疊的既有失敗）。

## PR

- **連結**：（建立後填入）
