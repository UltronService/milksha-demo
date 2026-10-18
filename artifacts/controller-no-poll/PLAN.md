# Controller：移除 4 秒 Firestore REST 輪詢，改為 onSnapshot 推送

**範圍**：`milksha-demo` 控制端（`/controller/`）雲端／Firestore 模式。  
**環境限制**：驗收僅用 `zz-qa-ci-store`、`zz-qa-store-a`；不碰 `c030020`、`s120030`、`a17` 或正式環境。  
**本文件**：調查結論 + 實作計畫（本 run 不改產品程式、不開 PR）。

---

## 1. 4 秒輪詢在哪裡、讀什麼、讀取量估算

### 1.1 主要來源（Firestore REST `getDocument`）

| 位置 | 函式 | 行為 |
|------|------|------|
| `controller/controller-app.js` | `startPolling()` | `setInterval(..., 4000)` |
| 同上 | 每次 tick | `pollDevice()` → `transport.readDevice(deviceId)` |
| 同上 | 每次 tick | `refreshBoardLists()` → `transport.readBoard()` |
| 同上 | 每次 tick（僅 local） | `publishLocalPocTargetFromForm()`（本機 localStorage，**非**雲端 Firestore） |

`startPolling()` 在 `connect()` 成功後呼叫（約 1568 行），以及在 `reconnectCloudForStoreChange()` 成功後（約 1430 行）。  
`connect()`／換店時會先各做一次 `await refreshBoardLists()` + `await pollDevice()`（一次性），再進入 4 秒週期。

**Firestore 路徑**（`js/transport/paths.js` + `js/transport/firestore-transport.js`）：

- 看板：`stores/{storeId}/board/today_board`
- 裝置：`stores/{storeId}/devices/{deviceId}`（表單 `#fld-device`，雲端預設 `stb-01`）

傳輸層為 **Firestore REST**（`js/transport/firestore-rest.js` 的 `getDocument`），每次 GET 計為 **1 次 document read**（與 Firebase 計費一致）。

**估算（單一已連線的 cloud 控制頁、前景常開、無其他操作）**：

- 週期：3600 ÷ 4 = **900** 次／小時  
- 每週期 2 個 GET → **約 1,800 Firestore reads／小時／分頁**  
- 連線／換店當下另加 **2** 次一次性 read（可忽略相對於長時間 idle）

若同時開 N 個控制頁，reads 近似 **N × 1,800／小時**（與店內實際叫號頻率無關——這是固定背景成本）。

### 1.2 其他週期性／重複讀取（controller 與共用 js）

| 來源 | 間隔 | 讀什麼 | 是否 milksha-qms-dev Firestore read |
|------|------|--------|-------------------------------------|
| `startStoreListPolling()`（`controller-app.js` ~1905） | 預設 **30s**（`store-list.js` `STORE_LIST_POLL_MS`） | Cloud Function **`listStores`**（HTTP POST） | **間接**：後端可能查 registry／裝置；**不是**控制端每 4s 的 `today_board`／`devices` GET |
| `clockTimer`（~2413） | 1s | 僅更新台北時間／UI | 否 |
| `setInterval` telemetry（~2492） | 500ms | 寫入 `window.__controllerTelemetry` | 否 |
| `mergeCloudLogs()` | **手動**按「合併雲端紀錄」 | `readReceiveLogs` + `readCommands`（REST list） | 是，但非週期 |
| 叫號／`push_numbers` 後 | 事件驅動 | `refreshBoardLists()`（REST） | 是；實作後應改為 listener 更新或 **單次** `forceRefetch`，避免與輪詢疊加 abort 問題（見 `artifacts/controller-abort-false-error/REPORT.md`） |
| `store-simulation*.js` | 無 `setInterval`／無 `readBoard` | — | 否 |
| `js/transport/*`（除 REST client） | 無週期 poll | — | 否 |
| **Board／Receiver**（`js/receiver/cloud-runtime.js`） | 自有 tick／realtime | 與控制端無關 | 本專案 **不修改** |

**本需求焦點**：拿掉 **4s** 的 `today_board` + `devices/{deviceId}` REST 輪詢。  
**可選後續**（不在本 PR 必做）：30s `listStores` 是否改為「僅 visibility 回到前景時刷新」或推送——需與產品確認門市清單 online 綠點是否可接受較慢更新。

### 1.3 現況：控制端 **沒有** onSnapshot

- `controller/index.html` **未**載入 Firebase compat CDN、`firebase-sdk-bridge.js`、`firestore-realtime.js`（對照根目錄 `index.html` 已載入）。
- `js/transport/firestore-realtime.js` 僅監聽 **`today_board`** 與 **`devices/{id}/control/pending`**（給 receiver 指令用），**沒有**整份 `devices/{deviceId}` 文件（心跳 `lastSeen`／`online`）。

---

## 2. 依賴 4s 輪詢的 UI／資料與 listener 對照

| 功能／區塊 | 目前資料來源（4s 或連線時一次） | 建議推送來源 | 現有 listener 可重用？ |
|-----------|----------------------------------|--------------|-------------------------|
| 準備中／可取餐清單 `#list-prep` `#list-ready` | `refreshBoardLists` → `today_board` | `today_board` onSnapshot | **部分**：`FirestoreRealtime` 已有 board listener；需在 controller 接上並套用 `CloudTicketReadback` + simulation 凍結邏輯 |
| 狀態列 board seq `#status-board-seq` | 同上 | 同上 | 同上 |
| 看板在線／離線 `#online-state`、`syncTransportRoute` | `pollDevice` → `devices/{deviceId}` 的 `lastSeen`、`online` | **`devices/{deviceId}` 文件 onSnapshot** | **否**：需新增 device doc listener（或擴充 `firestore-realtime.js` 的 controller 專用 factory） |
| 最後心跳時間 `#status-heartbeat-at` | `pollDevice` | device doc snapshot | 否（同上） |
| `setConnectedState`／連線 pill | 輪詢成功後 `setConnectedState(true)`；錯誤被 `catch` 吞掉 | listener 正常 + session 有效 → 已連線；listener／auth 失敗 → 顯示斷線 | 需新 UX（見 §3） |
| 門市下拉綠點（online） | **30s** `listStores`，非 4s | 可維持 30s 或改前景刷新 | 無 Firestore listener；非本輪必改 |
| 來源選擇 `#fld-source`／`#fld-quick-source` | 靜態 `SOURCE_OPTIONS` | 不依賴 poll | 不適用 |
| 快速送號／POS／devCommand | 寫入後 **主動** `refreshBoardLists` | push 應自動更新；post-send 可改 `forceRefetch()` 或依賴 snapshot | board listener |
| Local 模式看板連動提示 `refreshBoardLinkHint` | 4s tick 內呼叫（僅 `mode === 'local'`） | 改為 `fld-store`／`fld-device` change + 可選 `LocalPocCoord.subscribeLocalPocTarget` | local 專用，不計入雲端 read 成本 |
| 模擬門市 frozen／running | 輪詢仍跑但 `refreshBoardLists` 可能保留本地 tickets | listener 觸發時沿用現有 `simulationFrozenKeepsLocalTickets()` 分支 | 行為保持 |

---

## 3. 推送斷線時：現況 vs 建議

### 3.1 現況

- **無** realtime listener；依 4s REST。單次 `pollDevice` 失敗 **`catch` 忽略**（~1341），UI 可能長時間顯示過期的「在線」直到下一次成功讀取。
- **Token**：`auth-session.js` 有 refresh；控制端文件提到 **不會在 auth 失敗後自動整頁重連**（`artifacts/fresh-latency-pause-self-qa`）。
- **背景分頁**：`storeListPollTimer` 在 `document.hidden` 時 **跳過** tick；**4s 輪詢沒有** hidden 保護（背景仍讀 Firestore）。
- **REST 競態**：並發 `readBoard` 會 abort 舊請求（`firestore-rest.js`），曾造成送號後誤報錯（已有 `board-refresh-after-command.js` 緩解）。

### 3.2 建議（對齊 owner：**不要**恢復週期 poll）

1. **連線成功**：`ensureIdToken` → 啟動 **board + device** 兩個 `onSnapshot`（Firebase compat + `FirebaseSdkBridge.ensureFirebaseSignedIn`）。
2. **正常推送**：snapshot callback 走現有 `renderTicketLists`／`pollDevice` 同等邏輯（抽成 `applyBoardDoc`／`applyDeviceDoc` 避免重複）。
3. **Listener error／SDK 缺失**：
   - 顯示明確文案（例如 user banner：「即時同步中斷，正在重試…」），`data-realtime-connected="0"` 供測試。
   - **指數退避**重掛 listener（1s → 2s → … cap 30s），每次成功 attach 後 **各做 1 次** `get()`（或 `forceRefetch`）補齊狀態。
   - **禁止** `setInterval` 恢復 4s REST poll 作為 steady-state fallback（與 receiver 的 `enterPollFallback` 不同；controller 成本目標不同）。
4. **Token 過期**：`onListenerError` 若為 auth 類錯誤 → `session.refreshIdToken()` 一次 → 重掛 listener；仍失敗則維持斷線提示 + 退避，**不**週期 GET。
5. **背景分頁**：可選優化——`visibilitychange` 回到前景時 `forceRefetch()` 一次；hidden 期間依賴 Firestore 客戶端維持長連線（不額外 REST poll）。
6. **換店／disconnect**：`stop()` 取消 subscription；`disposeTransport()` 與現有流程一致。
7. **Local／firestore 模擬模式**：維持本機 shim 行為；雲端 read 優化僅針對 `mode === 'cloud'`（及必要時 emulator 上的 firestore 模式）。

---

## 4. TDD 測試案例（先紅後綠，白話步驟）

1. **60 秒 idle 沒有週期讀取**  
   - 紅：`controller-app.js` 仍含 `}, 4000)` 且 tick 呼叫 `pollDevice`／`refreshBoardLists`（更新 `tests/controller-polling.test.js` 期望）。  
   - 綠：cloud 連線後注入 mock transport／mock realtime，記錄 60s 內 `getDocument` 呼叫次數 ≤ 連線時的一次性 seed（≤2），無週期性增加。

2. **看板號碼靠推送更新**  
   - 紅：不呼叫 `refreshBoardLists`，僅觸發 fake `onBoardSnapshot`，`#list-ready` 應更新（目前無接線則失敗）。  
   - 綠：模擬 `today_board` 變更後，清單與 `#status-board-seq` 更新。

3. **看板在線狀態靠 device 推送**  
   - 紅：不 `pollDevice`，僅 device snapshot 更新 `lastSeen`，`#online-state` 應顯示在線。  
   - 綠：`data-board-online="1"` 且文案含「在線」。

4. **斷線提示**  
   - 紅：listener error callback 後應出現可測試的 banner／`data-testid`（目前無）。  
   - 綠：模擬 error → 顯示斷線文案；恢復 snapshot → 文案清除。

5. **斷線恢復不重啟 4s poll**  
   - 紅：error 後恢復仍不應有 `setInterval(4000)`。  
   - 綠：恢復後僅見退避重掛 + 至多各 1 次 `get`／`forceRefetch`。

6. **換店重訂閱**  
   - 紅：`zz-qa-store-a` → `zz-qa-ci-store` 後 listener path 應變更；舊 path 不再收事件。  
   - 綠：mock 驗證 `stop()` 後新 `storeId` 的 attach。

7. **送號後列表仍正確（無 abort 假錯）**  
   - 紅／綠：沿用／擴充 `tests/controller-post-send-board-refresh.test.js` 與 e2e `controller-post-send-board-read-abort.spec.mjs`——推送模式下不應因 REST abort 清空快速送號。

8. **讀取量前後對照（手動／e2e 選做）**  
   - 在 `zz-qa-store-a` 開控制頁連線，Firebase Console 或 instrumented `readCounts`：實作前 idle 1 分鐘 ≈ 30×2 reads；實作後 idle 1 分鐘 ≈ listener 初始 snapshot（2）+ 無變更則 **0** 額外 document reads。

**建議測試店**：`zz-qa-store-a`（日常）、`zz-qa-ci-store`（CI／換店案例）。

---

## 5. Board／Receiver 影響與版本號

| 區域 | 影響 |
|------|------|
| `js/milksha-board.js`、`js/receiver/*`、`index.html`（看板） | **預期無變更** |
| `js/transport/firestore-realtime.js` | **可能**小幅擴充（device doc listener 或 `createControllerRealtimeListener`），需保持 receiver 現有 API 相容 |
| `controller/index.html` | 新增 Firebase CDN 3 支 + `firebase-sdk-bridge.js` + `firestore-realtime.js`（或新 `controller-realtime-sync.js`） |
| `controller/controller-app.js` | 移除／取代 `startPolling`（cloud）；local 另處理 `publishLocalPocTargetFromForm` |
| **Asset version** | 需 bump `controller/index.html`（及若有新 js）的 `?v=`（目前 `20261017d`），與 repo 慣例一致，避免 GitHub Pages 快取舊 bundle |

---

## 6. 實作步驟摘要（待 OK 後執行）

1. 新增 **controller realtime 模組**：attach `today_board` + `devices/{deviceId}`；暴露 `start`／`stop`／`forceRefetch`／`getStats`。
2. **`controller/index.html`**：載入 Firebase compat + bridge + realtime（順序同 board）。
3. **`connect`／`reconnectCloudForStoreChange`／disconnect**：`stopPolling` → `startRealtime`；cloud 模式不再 `startPolling`。
4. 重構 **`refreshBoardLists`／`pollDevice`** 為可從 REST 與 snapshot 共用的 `apply*`（post-command 改 snapshot 或單次 refetch）。
5. **Local 模式**：保留低頻或事件驅動的本機同步（不打雲端）。
6. 更新 **`tests/controller-polling.test.js`** + 新增 unit tests；必要時 e2e 用 `?store=zz-qa-store-a`。
7. Bump **`?v=`**；自測後開 PR（含 What／Why／How to test）。

---

## 7. 風險與邊界

- Firebase SDK 未載入或 CSP 阻擋 CDN → 必須顯示錯誤並退避重試，**不能**靜默回到 4s poll。
- 僅監聽單一 `deviceId`；若店內多盒，在線狀態仍以表單選定裝置為準（與現況相同）。
- `listStores` 30s 仍會產生後端成本，與本次「4s Firestore GET」優化分開評估。
