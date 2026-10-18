# PR #101 真雲端 QA 結構化除錯

**Diag HEAD**：見本檔所在 commit（產品碼未修；基於 QA `b2e36a1` 行為）

**範圍**：僅 `zz-qa-store-a` / `stb-01`；不修改 ultron-player-2022 規則；機密 `<REDACTED>`。  
**原則**：本輪**不修產品碼**，只加重現腳本、live 回歸測試與假設表。

---

## 重現命令（會變紅）

環境：需可連 `milksha-qms-dev`（`config/firebase.js` 由 GitHub Pages 路由注入，API key 不寫入本檔）。

```bash
npx playwright install chromium

# 失敗 1 — 分支：看板在線燈號長期 offline
node artifacts/pr101-diag/repro-board-online.mjs --label=branch

# 失敗 1 — main 對照（應 PASS）
MILKSHA_SITE_ROOT=$PWD/artifacts/controller-no-poll/main-worktree \
  node artifacts/pr101-diag/repro-board-online.mjs --label=main-2f9b2bf

# 失敗 2 — 分支：斷網後 45s 內無「即時同步中斷…」
node artifacts/pr101-diag/repro-disconnect-banner.mjs --label=branch

# 失敗 2 — main 對照（main 無此 banner 產品行為，腳本亦 FAIL — 見下表）
MILKSHA_SITE_ROOT=$PWD/artifacts/controller-no-poll/main-worktree \
  node artifacts/pr101-diag/repro-disconnect-banner.mjs --label=main-2f9b2bf
```

Playwright 回歸（同情境，`playwright.config.js` 預設 **ignore** `*-live-cloud.spec.mjs`，需明確指定檔案）：

```bash
MILKSHA_CI_TIER=pr FONTCONFIG_FILE=tests/e2e/fonts/fontconfig-e2e.conf \
  npx playwright test tests/e2e/pr101-zz-qa-store-a-board-online-live-cloud.spec.mjs

MILKSHA_CI_TIER=pr FONTCONFIG_FILE=tests/e2e/fonts/fontconfig-e2e.conf \
  npx playwright test tests/e2e/pr101-zz-qa-store-a-realtime-disconnect-live-cloud.spec.mjs
```

除錯輸出：腳本與 `sampleControllerDbg` 會打 `[pr101-dbg]`；完整 JSON 落在 `artifacts/pr101-diag/evidence/*.json`（本機實跑產物，可不進版控）。

---

## Main 對照結果（本機實跑）

| 項目 | 分支（`MILKSHA_SITE_ROOT` = repo HEAD） | main `2f9b2bf` worktree |
|------|-------------------------------------------|-------------------------|
| 失敗 1 看板在線燈號 | **FAIL**（120s 內 `data-board-online` 仍 `0`） | **PASS**（數秒內 `1`） |
| 失敗 2 斷網 banner | **FAIL**（45s 內 banner 仍 `hidden`） | **FAIL**（main 無 realtime 斷線 banner；對照僅供「非 main 既有功能」） |

### 失敗 1 關鍵證據（分支 `board-online-branch-*.json` 摘要）

- `connected=1`，`realtimeStats.boardListen/deviceListen=true`，`telemetryRealtime=true`。
- `readCounts.board` / `readCounts.device` **全程為 1**（僅初次 snapshot，無後續 device 更新計數）。
- 同期 `transport.readDevice('stb-01')`（REST）回傳 `online: true`、新 `lastSeen`，但 `data-board-online` 仍 `0`。
- 路徑：`stores/zz-qa-store-a/devices/stb-01`（與 `Paths.deviceDocPath` 一致）。

---

## 後端提供：雲端「看板在線」事實（失敗 1）

以下為後端說明，**納入假設與驗證**（本 repo 未改 rules／排程）：

| # | 事實 | 對前端含義 |
|---|------|------------|
| B1 | 在線須**同時**滿足：機台文件 **「在線」欄位 = true**，且 **最後心跳在 3 分鐘內** | 僅看 `lastSeen` 或僅看 `online` 都不足；需與 `isRealBoardBoxDevice`（要求 `online`）+ `applyDeviceDocument`（用 `lastSeen` 算 age）對齊 **3 分鐘** 視窗。 |
| B2 | **「在線」欄位**由排程 **每 2 分鐘批次**更新，**非即時** | 看板已心跳但 `online` 仍 false 的窗口可達 **~2 分鐘**；4s 輪詢會反覆讀到「後來才變 true」；onSnapshot 若只推一次舊快照，UI 可能長期卡在 offline。 |
| B3 | 心跳**寫入紀錄**有節流（**每 300 秒**一筆），**不可**把紀錄寫入時間當「最後心跳」 | 須確認機台文件上**哪一個欄位**才是 authoritative「最後心跳」（見下方「請後端唯讀查證」）；若 snapshot/REST 混用錯欄位會誤判過期。 |
| B4 | `onSnapshot` 應與舊輪詢讀**同一份**機台文件；測試店須有 **read** 權限 | 路徑應為 `Paths.deviceDocPath(storeId, deviceId)`（與 `readDevice` REST 相同）；需驗證 `zz-qa-store-a` + controller `devLogin` 身分對該 doc 的 **get + listen** 一致。 |

**控制端預設 TTL**：`#fld-heartbeat-timeout` 預設 **120 秒**（`heartbeatTimeoutMs()`），與後端 **3 分鐘**窗口不一致時，可能出現「雲端仍視為在線、前端已視為過期」或相反；對照實測時應記錄表單上的 timeout 值。

---

## 舊 4 秒輪詢 vs `onSnapshot`（失敗 1 特別比對）

| 行為 | main `2f9b2bf`（4s `pollDevice` + REST） | 分支 realtime（device `onSnapshot`，且 `pollDevice` 在 `isActive()` 時 **return**） |
|------|------------------------------------------|-------------------------------------------------------------------------------------|
| **何時重算 `deviceOnline`** | 約每 **4s** 呼叫 `pollDevice` → `applyDeviceDocument`，每次用 **`Date.now()`** 與文件內 `lastSeen` 比 `heartbeatTimeoutMs()` | 僅在 **device 文件變更**觸發 snapshot 時呼叫 `applyDeviceDocument`；**文件不變則不重算** |
| **`tickClock`（1s）** | 只更新時鐘／序號／**顯示用** `lastHeartbeatAt` 文字，**不**重算 `deviceOnline` | 同左 |
| **對 B2（online 批次 2min）** | 最多等一個 poll 週期（4s）量級即可再次讀到 `online: true`（文件一更新或下一筆 REST 即反映） | 若 snapshot **未再推送**，可能一直停在第一次的 `online: false` |
| **對 B3（心跳紀錄 300s 節流）** | 每 4s REST `get` 仍會拿到文件當下欄位；**過期判斷用本地時間重算**同一個 `lastSeen` | 若 300s 內文件無欄位變更，**不會**因時間流逝而把已顯示「在線」改「離線」（亦無 4s 重算）— 與 main 行為不同 |
| **讀取路徑** | `transport.readDevice` → `Paths.deviceDocPath`（Firestore REST） | `controller-realtime-sync.js` → `db.doc(Paths.deviceDocPath(...)).onSnapshot` |

程式依據（分支）：`pollDevice` 在 realtime active 時跳過 REST；`applyDeviceDocument` 內 `deviceOnline = age < heartbeatTimeoutMs()`；`tickClock` 不觸及 `deviceOnline`。

**與本輪證據的關係**：分支在看板已跑、REST 側 `online: true` 時仍 `data-board-online=0`，且 `readCounts.device===1` → 除「不重算過期」外，更可能是 **首次 snapshot 未成功套用** 或 **snapshot 與 REST 欄位/權限不一致**；需與後端唯讀資料交叉驗證。

### 失敗 2 關鍵證據（分支 `disconnect-banner-branch-*.json` 摘要）

- `ctx.setOffline(true)` 後 `navigatorOnLine=false`，REST `readDevice` → `Failed to fetch`。
- `telemetryRealtime` **仍 true**，`realtime-disconnect-banner` **仍 hidden**。
- `readCounts` 未增加、未觸發 `onRealtimeState({ connected: false })` 路徑（見 `syncRealtimeDisconnectBanner`）。

---

## 失敗 1：看板在線燈號一直 offline

| 排序 | 假設 | 機制 | 現有證據 | 驗證方法 |
|------|------|------|----------|----------|
| **1** | **Realtime 停用 4s REST，且 snapshot 未再驅動 `applyDeviceDocument`（與 B2/B4）** | 燈號只靠 `onDeviceDoc`；`pollDevice` 在 `isActive()` 時 return。main 每 4s 仍 REST 重讀同一 doc。 | `readCounts.device===1`；REST 同期 `online:true`；main 數秒 PASS。 | 對照同一時刻 SDK `get(devicePath)` vs REST `readDevice` 欄位；listener 計數是否隨 `online` 批次更新而增加。 |
| **2** | **缺少「本地時間重算過期」：僅文件變更才重算 age（與 B1/B3）** | main：即使文件不變，每 4s 仍執行 `age < heartbeatTimeoutMs()`。分支：文件 300s 不變則不重算；**亦無法**在 `lastSeen` 不變時隨時間轉 offline。 | `tickClock` 不碰 `deviceOnline`；結構測試已鎖 `pollDevice` skip。 | 修復候選：定時用快取 `lastSeen` 重算或低頻 REST/device `get`（下一輪）；本輪用假資料單測「僅 snapshot 一次 + 時間前進」行為。 |
| **3** | **`online` 批次延遲 up to ~2min（B2）+ 前端只信第一次 snapshot** | 後端 `online` 非即時；首次 snapshot 可能 `online:false`，之後排程才 true。 | QA 若在剛開看板即看燈號，與 2min 窗口一致；本輪 120s repro 仍 FAIL 暗示非單純 B2。 | 後端提供 `online` 欄位最近更新時間；repro 拉長至 **>3min** 看是否仍 offline。 |
| **4** | **用錯心跳欄位或誤用節流紀錄時間（B3）** | 雲端 3min 窗口依 **正確** 最後心跳欄位；紀錄表 300s 一筆不能當 heartbeat。 | REST 樣本僅見 `lastSeen`；未確認是否等同後端 authoritative 欄位。 | 後端列出 doc 欄位定義 + `zz-qa-store-a/stb-01` 當下各時間戳；前端比對 `applyDeviceDocument` 讀的 key。 |
| **5** | **Rules：`listen` 與 REST `get` 不同源或測試店無 listen（B4）** | 路徑應相同：`stores/{store}/devices/{deviceId}`。 | `deviceListen:true` 但可能僅空快照；REST 有 body。 | 後端以 controller 相同 custom token 試 **get + listen**；見下方查證清單。 |
| **6** | **前端 TTL 120s ≠ 雲端 3min（B1）** | `heartbeatTimeoutMs()` 預設 120s，較雲端寬鬆/嚴格視 `lastSeen` 新舊而定。 | 表單預設需實測截圖。 | repro 時記錄 `#fld-heartbeat-timeout`；必要時暫設 **180** 排除 TTL 假陽性（僅 diag，不改產品）。 |

**與 fake-cloud 差異**：fake-cloud 走 `rest-wake` + `pollDevice`／catch-up，**不會**走假設 1 的「停用 REST」路徑；故 PR CI 未捕獲此真雲端問題。

---

## 請後端唯讀查證（`zz-qa-store-a` / `stb-01`）

請後端在 **不改設定** 前提下提供（可打碼 token／內部 id）：

1. **文件路徑確認**：是否為 `stores/zz-qa-store-a/devices/stb-01`（與 `QMS.Transport.Paths.deviceDocPath` 一致）。
2. **欄位清單與語意**：  
   - 「在線」布林欄位 **Firestore 欄位名**（是否即 `online`）。  
   - **最後心跳** authoritative 欄位名（是否即 `lastSeen`；若另有 `lastHeartbeatAt` 等請標明）。  
   - 若有 **心跳寫入紀錄**／子集合，請說明與機台文件欄位的對應，並註明 **不可** 用紀錄 `createTime` 當心跳。
3. **單點快照**（repro 時段即可）：`online`、`lastSeen`（及上項欄位）、`appVersion`、`updateTime`／server timestamp。
4. **排程**：最近一次 **`online` 批次** 執行時間與寫入值；下次預期窗口（2min 週期）。
5. **節流**：該機台最近一次 **有效心跳更新** 時間（非 300s 紀錄表寫入時間）。
6. **權限**：controller `devLogin` 對該 doc 的 **read** 是否同時允許 Firestore **get** 與 **listen**（與 REST 代理是否同一視圖）。
7. **雲端在線判定**：後端程式是否同時檢查 **online=true** 且 **最後心跳 &lt; 3min**（與前端 `isRealBoardBoxDevice` + age 對照）。

取得後填入 `artifacts/pr101-diag/evidence/backend-device-facts.json`（可選）並更新本表「現有證據」欄。

---

## 失敗 2：斷網無「即時同步中斷，正在重試…」

| 排序 | 假設 | 機制 | 現有證據 | 驗證方法 |
|------|------|------|----------|----------|
| **1** | **Banner 只聽 `onRealtimeState.connected===false`，不聽 `navigator.onLine`** | `syncRealtimeDisconnectBanner` 僅由 `startCloudRealtimeSync` 的 `onRealtimeState` 觸發；`stopped` 會關 banner。 | 斷網後 `telemetryRealtime` 仍 true、banner hidden。 | 在 `onSnapshot` error callback / `metadata` 打 `[pr101-dbg]`；或 `page.evaluate` 監聽 `window` `offline` 事件是否未被 controller 使用（grep 已無 listener）。 |
| **2** | **Firestore SDK 斷網後長時間不觸發 error callback** | 已知行為：連線僵死，仍保持 `connected: true` 直到 timeout。 | 45s offline 樣本無 `readCounts` 變化、無 banner。 | 延長 offline 至 2–5min 實測；查 Firebase JS SDK 版本與 `enableNetwork`/`disableNetwork` 行為。 |
| **3** | **`fromCache` metadata 未處理** | 未讀 `snap.metadata.fromCache` / `hasPendingWrites` 推斷斷線。 | 未實作 metadata 分支（程式碼審查）。 | 在 `controller-realtime-sync.js` snapshot handler 暫加 dbg 印 `metadata`（下一輪）。 |
| **4** | **Listener 仍「active」但無資料** | `isActive()` 僅看 attach 旗標，不代表網路健康。 | `deviceListen/boardListen` 斷網後仍 true。 | 斷網時呼叫 `getCloudRealtimeStats()` + 強制 `get()` 看 reject 時是否進 `onListenerError`。 |
| **5** | **斷網測法與 QA「拔線」不同但同類** | Playwright `setOffline` 模擬無網路；拔線同樣不保證 immediate snapshot error。 | 與 QA 描述一致（無 banner）。 | QA 手動拔線 + 保留 `[pr101-dbg]` 樣本對照。 |

**Main 對照**：`2f9b2bf` 無 `#realtime-disconnect-banner` 行為；失敗 2 為 **本 PR 新 UX 在真雲端未達標**，非「main 也有 banner」類問題。

---

## 已加入的回歸測試（預期在分支 live 跑紅）

| 檔案 | 說明 |
|------|------|
| `tests/e2e/pr101-zz-qa-store-a-board-online-live-cloud.spec.mjs` | 真雲端 zz-qa-store-a，`data-board-online===1` |
| `tests/e2e/pr101-zz-qa-store-a-realtime-disconnect-live-cloud.spec.mjs` | 斷網後 banner 文案 |
| `tests/controller-pr101-realtime-device-heartbeat.test.js` | 結構斷言：`pollDevice` 在 realtime active 時跳過 REST |

---

## 建議修復方向（**本輪不實作**）

1. **失敗 1**：（候選，未實作）低頻 REST/device `get` 或 **本地定時重算** `lastSeen` age（恢復 main 4s 輪詢的「時間推移」效果）；對齊 **3min** 與 B2 批次 `online`；確認 snapshot 與 REST 同一欄位；listener 收不到更新時 fallback `forceRefetch`。
2. **失敗 2**：訂閱 `window offline` / Firestore `onSnapshotsInSync` / snapshot `metadata` + listener error，在斷線時設 `cloudRealtimeConnected=false` 並顯示 banner。

---

## 參考

- QA 描述（bc-01c395bf artifacts 不可讀時以 chat 為準）
- 分支 HEAD 見本 PR 最新 commit（`artifacts/controller-no-poll/REPORT.md` 為前輪 CI 報告）
