# PR #95 — 準備中 → 請取餐 後「此號碼已在看板上」（`b35c419`）

- **PR:** https://github.com/UltronService/milksha-demo/pull/95
- **HEAD（除錯基線）:** `b35c419`
- **對照（QA 稱無此現象）:** `f02ddca`（`controller/controller-app.js` 與 `b35c419` **無 diff**）
- **本輪:** 僅回歸測試 + 假設，**不修程式**

## 現象（QA）

同一來源、同一號碼：先以「準備中」送出成功，再把目標狀態改為「請取餐」後，送出鈕變灰、`quick-send-rule-note` 顯示「此號碼已在看板上」。  
預期（`da07bd3` 起）：重複判斷依**目標狀態**分區，準備中已有號碼時，改送請取餐**應可送**。

## 回歸測試

| 項目 | 內容 |
|------|------|
| 檔案 | `tests/e2e/controller-quick-send-status-switch-duplicate.spec.mjs` |
| 環境 | local POC（`urlsLocalHomePoc`），門市號 `3471` |
| 斷言 | 改為 `ready` 後，邏輯上 `sendBlocked === false`，且 **note 不得仍顯示重複**、**按鈕 disabled 須與 sendBlocked 一致** |

### 重現指令

```bash
# 需已 npm ci；Playwright chromium 已安裝
cd /workspace

# 紅燈（目前 tip）
git checkout b35c419
MILKSHA_CI_TIER=pr npx playwright test tests/e2e/controller-quick-send-status-switch-duplicate.spec.mjs

# 對照 f02ddca（本測試在本機同樣紅燈；見下方說明）
git checkout f02ddca
# 將 spec 從 b35c419 複製到工作樹後執行同一指令
```

**本機結果（2026-10-18）：**

| Ref | 結果 | `uiState`（失敗時） |
|-----|------|---------------------|
| `b35c419` | **FAIL** | `sendBlocked:false`, `buttonDisabled:true`, `noteHasDuplicate:true` |
| `f02ddca` | **FAIL** | 同上 |

> QA 在 `f02ddca` 未見問題，可能手動路徑不同（例如未等 `refreshBoardLists` 後的 UI 同步、或 cloud 模式）。自動化測試鎖定 **狀態切換後 UI 與邏輯 guard 不一致**（與 QA 看到的灰鈕 + 文案一致）。

## `git diff f02ddca..b35c419` 可能引入點

| 區域 | 變更 | 與本 bug 關聯 |
|------|------|----------------|
| `controller/controller-app.js` | **無變更** | 重複 guard、`initQuickSendFieldUi` 與 `f02ddca` 相同 |
| `controller/controller-send-number.js` | 預設號、規則文案、`validateQuickSendNumber` 改走 `normalizeBoardDisplayNumber` / cloud sanitize | 可能改變**何時** `validated.ok`；**不**改 `quickSendNumberOnBoard` 分區邏輯 |
| `js/board/pos-ticket-display-no.js` + `js/milksha-board.js` | 新增 cloud sanitize | 影響看板／驗證 normalize；**不**直接改 controller duplicate 迴圈 |
| `controller/store-simulation.js` | 模擬器號碼 | 與 quick-send 手動路徑無關 |

**較可能根因（pre-`4ac628a` 已存在）：** `initQuickSendFieldUi` 只監聽 `fld-quick-source` / `fld-quick-no`，**未**監聽 `fld-quick-status`；`refreshBoardLists` → `syncQuickSendFieldUi` 在仍為「準備中」時把 note 設成重複；改狀態後未 `syncQuickSendFieldUi`，note 與 `disabled` 停留在舊狀態。  
`4ac628a` 可能讓 QA **更常**觸發 post-send refresh（normalize／readback 路徑變長）而更容易看到。

## 假設（依可能性排序）

### H1 — `fld-quick-status` 變更未觸發 `syncQuickSendFieldUi` / `syncActionButtonStates`（**最可能**）

| | |
|--|--|
| **機制** | `buildQuickSendPresentationForField` 每次會用 `readQuickSendStatus()` 重算 `duplicateOnBoard`，但 **DOM 只在 `syncQuickSendFieldUi` 更新**。`syncActionButtonStates` 單獨呼叫時會重算 `isQuickSendSendBlocked()`（按鈕應解鎖），但若未再跑 `syncQuickSendFieldUi`，note 仍顯示「已在看板上」；若也未跑 `syncActionButtonStates`，按鈕保持 `disabled`。 |
| **證據** | `initQuickSendFieldUi`（`controller-app.js` ~919–940）無 `fld-quick-status` listener；回歸測試在 `selectOption(..., 'ready')` 後 `sendBlocked:false` 但 `noteHasDuplicate:true` 且 `buttonDisabled:true`。 |
| **驗證** | 在 `fld-quick-status` `change` 加 `[pr95-status-switch-dup]` log + `syncQuickSendFieldUi(); syncActionButtonStates();`（修復候選，本輪不做）；或 Playwright 手動 `evaluate` 呼叫同名 sync 後預期測試轉綠。 |

### H2 — post-send `refreshBoardLists` 固定鎖住「準備中」重複 UI，與後續狀態切換脫鉤

| | |
|--|--|
| **機制** | `sendQuickDemoNumber` → `posSend` → `refreshBoardLists`（~1354）→ `syncQuickSendFieldUi`（~1442）；當時 dropdown 仍為 preparing → `duplicateOnBoard:true`。 |
| **證據** | 回歸測試在第一次送出後可穩定等到 note 含「此號碼已在看板上」。 |
| **驗證** | `[pr95-status-switch-dup]` 記錄 `refreshBoardLists` 結尾與 `readQuickSendStatus()`；比對時間序與 QA 操作（先改狀態 vs 先 refresh）。 |

### H3 — `4ac628a` normalize 使 `validated.normalized` 與 `tickets[].no` 不一致，導致誤判重複

| | |
|--|--|
| **機制** | cloud sanitize 後欄位值與 local `tickets` 字串不同，`quickSendNumberOnBoard` 比對失敗或雙重條目。 |
| **證據** | `f02ddca..b35c419` 無 `controller-app.js` diff；本測試用門市 4 位純數字，風險較低。 |
| **驗證** | 失敗時 log `[pr95-status-switch-dup] tickets=` JSON 與 `validated.normalized`；對 fp `#`、uber hex 重跑同一 spec。 |

### H4 — `duplicateKey`（channel + 號碼）誤用到 controller quick-send

| | |
|--|--|
| **機制** | `pos-ticket-display-no.js` 的 `duplicateKey` 若取代 `sourceKey+no+status` 會跨區封鎖。 |
| **證據** | `quickSendNumberOnBoard` 仍為 `sourceKey` + `no` + `status`（~836–846）；`duplicateKey` 未在 controller 引用。 |
| **驗證** | `rg duplicateKey controller/` 應仍為 0；必要時在 DIAG 修復時加單元測試鎖定 API。 |

### H5 — cloud / `zz-qa-*` 模式 readback 把票券 `status` 寫成 `ready`，使 guard 認為請取餐重複

| | |
|--|--|
| **機制** | `mapCloudBoardTicketsToLocal` 預設 `status: 'ready'`（`controller-cloud-ticket-readback.js` ~81）若 cloud 缺 status。 |
| **證據** | 本回歸用 **local** 已重現 stale UI；cloud 為 QA 可能差異路徑。 |
| **驗證** | 複製同一 spec 改 `mode=cloud&store=zz-qa-ci-store`（僅 zz-qa），比對 `getTickets()` 與 fake-cloud payload。 |

## 建議修復方向（僅記錄，本輪不實作）

在 `initQuickSendFieldUi` 為 `fld-quick-status` 訂閱 `change`：`hideQuickSendSuccess()`、`syncQuickSendFieldUi()`、`syncActionButtonStates()`，並以 `[pr95-status-switch-dup]` 打一次 debug log 確認順序。

## 變更清單（本輪）

- 新增 `tests/e2e/controller-quick-send-status-switch-duplicate.spec.mjs`
- 本檔 `artifacts/pr95-status-switch-dup/DIAG.md`
