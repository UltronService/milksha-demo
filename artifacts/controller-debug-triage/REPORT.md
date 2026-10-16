# Controller / board debug triage（c030020 雲端場景）

## 1. 快速送號欄位無法固定舊號碼

**根因（檔案／行）**
- `controller/controller-app.js` `bumpNumberFieldAfterSend()`（約 667–682 行）在門市來源送號成功後，會把 **`fld-quick-no` 與 `fld-no` 一起 +1**。
- `sendQuickDemoNumber()`（約 2014–2071 行）**固定 `status: 'ready'`**，無法用快速送號重送「準備中」做「已在請取餐 → 再送準備中應留請取餐」驗收。
- 欄位本身**可編輯**（`controller/index.html` 59 行，無 `readonly`）；阻礙來自成功後自動改號 + 缺狀態選項，非輸入鎖死。

**假設（3–5）**
1. 每次送出後自動遞增覆蓋手動輸入的號碼。
2. 空號碼時走 `allocateOrderNumber()` 自動配號，誤以為不能指定舊號。
3. 快速送號只有「請取餐」，無法測 preparing 回送。
4. 模擬運行時 `syncSimulationNumberFieldFromTickets` 只改 `fld-no`，與 quick 欄位混淆（次要）。
5. 非 store 來源不 bump，但預設來源為門市。

**修正（本 PR）**
- `bumpNumberFieldAfterSend` **不再寫入** `fld-quick-no`。
- 快速送號區新增 **`fld-quick-status`**（準備中／請取餐），`sendQuickDemoNumber` 讀取該狀態。

**回歸**
- `tests/e2e/controller-quick-send-resend.spec.mjs`（固定 3456、preparing 不回退 ready）— **綠**

---

## 2. 持續模擬在「看板換頁／長時間」後像停止；Udd／Uber 未出現

**根因**
- `controller/controller-app.js` 2098–2103 行（已移除）：`pagehide`／`beforeunload` 會 **`stopStoreSimulation('page_hide')`**；測試人員若在同一分頁離開控制端或觸發 unload，模擬會停。
- `controller/store-simulation-host.js` 204–206 行：`onPageHide()` 原先也 `stop('page_hide')`（已改為 no-op）。
- **看板換頁**（`js/milksha-board.js` ready 分頁）**不會**停止控制端模擬；長時間無外送號常是模擬已停或名單未再推送。
- `refreshBoardLists()` 每 4s 從雲端讀回覆寫本地 `tickets`（1193–1212 行），模擬運行中會與本地 reconcile **打架**（已加 `simulationRunningKeepsLocalTickets()` 跳過覆寫）。
- 名單 >50 筆時 `validateTicketsForBoardPush` 拒絕推送（`store-simulation.js` 637–638 行），模擬邏輯仍跑但**板面不更新**（非自動 stop）。
- 權重 `SOURCE_PICK_WEIGHTS`（store 70%，其餘各 7.5%）與 Udd 4 位、Uber 5 碼 hex（`store-simulation.js` 13–19、149–158、257–258 行）與看板 `normalizeBoardDisplayNumber` 一致。

**假設**
1. 控制端分頁 unload 觸發 pagehide 停止模擬。
2. 輪詢讀板覆寫模擬 tickets，送出 stale／空 diff。
3. 50 筆上限導致 push 失敗且�僅 banner 提示。
4. 7.5% 外送 + 10 分鐘內訂單數少，肉眼看板像「只有門市」。
5. 外送號在板上分頁或已 take-down，當下 DOM 看不到。

**修正（本 PR）**
- 移除 `pagehide`／`beforeunload` 自動停止。
- 模擬 **running** 時保留本地 tickets，不讓 poll 覆寫。

**驗證**
- Unit：`tests/controller-store-simulation.test.js` — `host onPageHide does not stop`、`10m fake clock` 含 udd/uber — **綠**
- E2E：快轉 10 分鐘 clock + peak，`__controller.getTickets()` 統計各來源 — **綠**（`controller-quick-send-resend.spec.mjs`）

---

## 3. 「模擬斷網」看板無感；拔線只停控制端

**根因**
- **`btn-offline`**：`sendCommand('simulate_offline')` → 看板 `cloud-runtime.js` `handleCommand`（1230+ 行）設 `simulateOffline`，**停止 apply 新板資料**（557–564 行）。
- **`syncCloudGuestStatusUi`**（277–278 行）在 `simulateOffline === true` 時曾設 **`offline = false`**，訪客看板**不顯示「離線」** → 測試員以為無效。
- **`btn-cable-pull`**：`controller-app.js` 2126–2137 行 `pauseCloud = true`，僅攔截**控制端** `cloudCall`（367、918 行），**看板仍連 Firebase**。
- 訪客看板預設 `?demo=0`，demo 面板文案不可見；需 **`#milksha-cloud-offline`** 或 URL 測試鉤子。

**假設**
1. 以為拔線會斷看板（實際只斷控制器 outbound）。
2. simulate_offline 有作用但 UI 隱藏離線態。
3. 看板仍顯示最後一帧快取，以為仍在更新。
4. devCommand 未到達裝置（連線／權限）。
5. 與真實網路中斷混淆（需擋看板自身 fetch）。

**修正（本 PR）**
- `simulateOffline` 時 **`offline = true`** 並在 command 後 **`syncCloudGuestStatusUi(true)`**。
- 看板 dev 站 URL：`?boardSimOffline=1`（需 dev hooks）→ `enterSimulateOffline()`。
- 控制端 `sec-net` 增加 **`net-sim-hint`** 說明三者差異。

**回歸**
- `tests/cloud-runtime-simulate-offline-ui.test.js` — **綠**
- `tests/e2e/controller-simulate-offline-board.spec.mjs` — **綠**

---

## 看板 DOM 量測（1920×1080）

來源：`scripts/measure-board-source-dom.mjs` → `artifacts/controller-debug-triage/board-source-measurements-1920x1080.json`

| 來源 | font-family | font-weight | font-size | icon 寬×高 (px) | 備註 |
|------|-------------|-------------|-----------|-----------------|------|
| store | Arial, Arimo, sans-serif | 400 | 70px | — | 門市無 icon |
| point | 同上 | 400 | 70px | 54×54 | icon box 54px |
| fp | 同上 | 400 | 70px | 54×54 | 顯示 `#6405` |
| uber | 同上 | 400 | 70px | 54×54 | 5 碼 hex |
| udd | 同上 | 400 | 70px | — | Udd 無 icon |

Chip 為 icon＋號碼欄位排版；間距以 cream 欄位 grid 為準（與 PR74 layout 腳本一致），非單純 number→icon 右緣相減。

---

## UAT（非工程）

1. 控制端選 c030020 雲端連線；看板 `?mode=cloud&store=c030020` **確認空白**。
2. 快速送號：輸入固定 4 碼 → 送請取餐 → 改「準備中」再送同號 → 看板仍只在請取餐。
3. 啟動「一般」模擬 ≥10 分鐘；控制端狀態仍「運行中」；板面可見 Uber／Udd 類號碼（多分頁翻找）。
4. 「模擬斷網」→ 看板左上/離線條「離線」；「恢復」→ 離線消失。拔線測試 → 看板**不**應離線。
5. 結束後控制端 **clear_now** 清空 c030020。

---

## PR

（推送後填入 PR URL）
