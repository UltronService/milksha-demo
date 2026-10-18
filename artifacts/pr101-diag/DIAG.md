# PR #101 真雲端 QA 結構化除錯

**Diag HEAD**：`26b8049`（產品碼未修；基於 QA `b2e36a1` 行為）

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

### 失敗 2 關鍵證據（分支 `disconnect-banner-branch-*.json` 摘要）

- `ctx.setOffline(true)` 後 `navigatorOnLine=false`，REST `readDevice` → `Failed to fetch`。
- `telemetryRealtime` **仍 true**，`realtime-disconnect-banner` **仍 hidden**。
- `readCounts` 未增加、未觸發 `onRealtimeState({ connected: false })` 路徑（見 `syncRealtimeDisconnectBanner`）。

---

## 失敗 1：看板在線燈號一直 offline

| 排序 | 假設 | 機制 | 現有證據 | 驗證方法 |
|------|------|------|----------|----------|
| **1** | **Realtime 模式下停用 REST `pollDevice`，但 device `onSnapshot` 未把心跳寫入 `deviceOnline`** | `pollDevice` 在 `cloudSyncMode==='realtime' && isActive()` 時直接 `return`；燈號只靠 `applyDeviceDocument` ← `onDeviceDoc`。 | 分支 REST 有 `online:true` 但 UI offline；`readCounts.device===1` 不增。 | 在 `sampleControllerDbg` 加 Firestore `get()` 與 snapshot 欄位 diff；或暫時在 `onDeviceDoc` 打 `[pr101-dbg]` 印 `snap.data()`（下一輪修復 PR）。 |
| **2** | **初次 device snapshot 缺欄位／`exists:false`，且後續 heartbeat 未觸發 listener** | `emitDeviceFromSnapshot` 僅在 callback 時 `bump`；若 listener 不再推送，狀態卡在 offline。 | 120s 內 `readCounts.device` 恆為 1；看板仍在跑 `receiverCloud`。 | Firestore Console（唯讀）看 `devices/stb-01` 更新頻率；對照 board 端 heartbeat 時間戳與 controller listener 計數。 |
| **3** | **`isRealBoardBoxDevice` 過濾掉真實資料** | 需 `lastSeen` + `online===true`，排除 `controllerDeviceStub` / stub `appVersion`。 | REST 樣本 `appVersion: receiver-demo-…`、`online: true`；若 snapshot 欄位型別不同會失敗。 | 比對 REST JSON 與 SDK `snap.data()` 逐欄；單元測試餵假 snapshot。 |
| **4** | **Rules 對 `listen` vs REST proxy `get` 不一致** | REST 走 Cloud Functions；SDK 走 Firestore rules + custom token。 | `authUser: true`、listener attach 成功但可能只讀到空文件。 | 唯讀：Firebase Rules Simulator / 後端 log（不改 rules）；比對同 uid REST vs SDK `get`。 |
| **5** | **`deviceId`／店號不一致** | listener 綁 `fld-device` + `storeId()`。 | 路徑已為 `zz-qa-store-a` / `stb-01`；可能性較低。 | URL 明確帶 `device=`；確認 `#fld-store` 值。 |

**與 fake-cloud 差異**：fake-cloud 走 `rest-wake` + `pollDevice`／catch-up，**不會**走假設 1 的「停用 REST」路徑；故 PR CI 未捕獲此真雲端問題。

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

1. **失敗 1**：realtime 模式下仍用 REST **或** snapshot `get()` 週期性刷新 device 心跳；或修 device listener 為何不收更新；或 `forceRefetch` device on board snapshot。
2. **失敗 2**：訂閱 `window offline` / Firestore `onSnapshotsInSync` / snapshot `metadata` + listener error，在斷線時設 `cloudRealtimeConnected=false` 並顯示 banner。

---

## 參考

- QA 描述（bc-01c395bf artifacts 不可讀時以 chat 為準）
- 分支 HEAD 見本 PR 最新 commit（`artifacts/controller-no-poll/REPORT.md` 為前輪 CI 報告）
