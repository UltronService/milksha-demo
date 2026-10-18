# PR #101 真雲端 QA 結構化除錯

**Diag HEAD**：見本檔所在 commit（產品碼未修）。

**範圍**：僅 `zz-qa-store-a` / `stb-01`；不修改 ultron-player-2022 規則；機密 `<REDACTED>`。  
**原則**：本輪**不修產品碼**；**本 DIAG 不記錄雲端文件欄位值**（僅列問題請後端唯讀查）；細節見 `artifacts/pr101-diag/evidence/*.json`。

---

## 假設清單索引（後端 B1–B4 + QA）

| ID | 摘要 | 主要對應 |
|----|------|----------|
| **B1** | 雲端在線 = `online` + 最後心跳 &lt; 3min | 失敗 1 |
| **B2** | `online` 排程每 2min 批次 | 失敗 1 |
| **B3** | 心跳紀錄 300s 節流，不可當最後心跳 | 失敗 1 |
| **B4** | onSnapshot 與 REST 同 doc、測試店 read（get+listen） | 失敗 1 |
| **QA-F1** | **先**用 main `2f9b2bf` 在 zz-qa-store-a 確認燈號是否也 offline | 失敗 1 |
| **QA-F2a** | 整瀏覽器斷網 30s：Firestore SDK 可能僅離線模式、不觸發 onSnapshot error → 無 banner | 失敗 2 |
| **QA-F2b** | 只擋雲端 URL 2.5s：短斷連是否仍不觸發 error／banner | 失敗 2 |

---

## 重現命令（會變紅／對照）

```bash
npx playwright install chromium

# --- 失敗 1（QA-F1：請先跑 main，再跑分支）---
MILKSHA_SITE_ROOT=$PWD/artifacts/controller-no-poll/main-worktree \
  node artifacts/pr101-diag/repro-board-online.mjs --label=main-2f9b2bf

node artifacts/pr101-diag/repro-board-online.mjs --label=branch

# --- 失敗 2（分支；main 無 banner UX）---
# (a) 整個瀏覽器斷網 30 秒（斷網期間每 ~2s 取樣）
node artifacts/pr101-diag/repro-disconnect-browser-offline-30s.mjs --label=branch

# (b) 只擋雲端後端 URL 2.5 秒，之後再觀察 30 秒
node artifacts/pr101-diag/repro-disconnect-cloud-block-2.5s.mjs --label=branch

# 相容舊名（同 2a）
node artifacts/pr101-diag/repro-disconnect-banner.mjs --label=branch
```

Playwright live 回歸（`playwright.config.js` 預設 ignore `*-live-cloud.spec.mjs`）：

```bash
MILKSHA_CI_TIER=pr FONTCONFIG_FILE=tests/e2e/fonts/fontconfig-e2e.conf \
  npx playwright test tests/e2e/pr101-zz-qa-store-a-board-online-live-cloud.spec.mjs

MILKSHA_CI_TIER=pr FONTCONFIG_FILE=tests/e2e/fonts/fontconfig-e2e.conf \
  npx playwright test tests/e2e/pr101-zz-qa-store-a-realtime-disconnect-live-cloud.spec.mjs
```

`[pr101-dbg]` 輸出；JSON 證據：`artifacts/pr101-diag/evidence/`。

---

## QA-F1：main `2f9b2bf` 真雲端對照（zz-qa-store-a）

**順序**：依 QA 要求，**必先**在 main worktree 跑 `repro-board-online`，再跑分支。

| 步驟 | Ref | 命令 `--label` | 結果（本輪實跑） |
|------|-----|----------------|------------------|
| 1 | main `2f9b2bf` | `main-2f9b2bf-qa` | **PASS** — 120s 窗口內 `data-board-online` 變 `1`（約數秒） |
| 2 | 分支 PR #101 | `branch-qa` | **FAIL** — 120s 內仍 `data-board-online=0` |

**結論（QA-F1）**：同一店別真雲端下，**main 在線燈正常、分支長期離線** → 屬 **PR 行為回歸**，非「zz-qa-store-a 上 main 也離線」的環境問題。

分支失敗 1 行為摘要（**不含雲端欄位值**）：`connected=1`、realtime listener 已 attach、device snapshot 計數未再增加；同期 REST `readDevice` 可成功但 UI 未轉在線。詳見本機 `evidence/board-online-*-qa.json`（**不進版控**；`restDeviceShape` 僅布林形狀）。

---

## 後端雲端事實 B1–B4（納入假設，非本檔查證資料）

| # | 事實 | 對前端含義 |
|---|------|------------|
| B1 | 在線須 **online** 且最後心跳 **&lt; 3min** | 須對齊 `isRealBoardBoxDevice` + `applyDeviceDocument` 年齡計算 |
| B2 | **online** 每 **2min** 批次 | 4s REST 可等到更新；onSnapshot 可能只握舊快照 |
| B3 | 紀錄寫入 **300s** 節流 | 不可把紀錄時間當最後心跳欄位 |
| B4 | 與舊輪詢 **同一機台 doc** + 測試店 **read** | 路徑 `Paths.deviceDocPath`；get vs listen 權限一致 |

控制端 `#fld-heartbeat-timeout` 預設 **120s**，與雲端 **3min** 是否一致請後端／QA 對表單設定一併確認（本 DIAG 不記錄實際值）。

---

## 舊 4s 輪詢 vs onSnapshot（失敗 1）

| 行為 | main `2f9b2bf` | 分支 realtime |
|------|----------------|---------------|
| 重算 `deviceOnline` | 約每 **4s** `pollDevice` → 每次 `Date.now()` 與 `lastSeen` 比 TTL | 僅 **device 文件變更** 時 `applyDeviceDocument` |
| `tickClock`（1s） | 不重算 `deviceOnline` | 同左 |
| 與 B2/B3 | REST 反覆讀 doc + 本地重算過期 | 無 4s REST；無文件變更則不重算 |

---

## 失敗 1：看板在線燈號一直 offline

| 排序 | ID | 假設 | 機制 | 現有證據 | 驗證方法 |
|------|-----|------|------|----------|----------|
| 1 | QA-F1 | main 同店也 offline？ | 若 main 也 FAIL 則偏環境／店別；否則偏 PR。 | **main PASS、分支 FAIL**（上表） | 必先跑 main repro |
| 2 | B4,H1 | Realtime 停 REST + snapshot 未再套用 | `pollDevice` skip；燈號只靠 `onDeviceDoc`。 | 分支 evidence JSON；main PASS | SDK get vs REST 同路徑；listener 計數 |
| 3 | B1,B3,H2 | 無本地時間重算過期 | main 每 4s 重算 age；snapshot 僅變更時重算。 | 結構測試 `tickClock` | 單測時間推移 + 單次 snapshot |
| 4 | B2,H3 | `online` 2min 批次 + 只信首次 snapshot | 首次 `online:false` 可卡死至下一推送。 | 120s 分支仍 FAIL | repro &gt;3min；後端答 Q4 |
| 5 | B3,H4 | 心跳欄位／紀錄時間誤用 | 須用 authoritative 心跳欄位。 | 見 JSON（DIAG 不抄值） | 後端答 Q2–Q3 |
| 6 | B4,H5 | get/listen 權限或視圖不一致 | REST 與 SDK 不同源。 | listener attach 但計數不增 | 後端答 Q6 |
| 7 | B1,H6 | 前端 TTL 120s ≠ 雲端 3min | 過期判定與後端不一致。 | 表單預設待記錄 | repro 記錄 `#fld-heartbeat-timeout` |

---

## 失敗 2：斷網無「即時同步中斷，正在重試…」

| 排序 | ID | 假設 | 機制 | 現有證據 | 驗證方法 |
|------|-----|------|------|----------|----------|
| 1 | **QA-F2** | **SDK 斷網僅離線模式、不觸發 onSnapshot error** | Banner 只聽 `onRealtimeState(connected:false)`，非 `navigator.offline`／`metadata.fromCache`。 | 2a/2b repro **FAIL**；`telemetryRealtime` 仍 true | 2a、2b 命令；暫加 dbg 印 snapshot metadata |
| 2 | QA-F2a | 整瀏覽器斷網 30s | `setOffline(true)` 30s 內取樣。 | `disconnect-browser-offline-30s-branch-qa.json` | `repro-disconnect-browser-offline-30s.mjs` |
| 3 | QA-F2b | 只擋雲端 URL 2.5s | `isMilkshaCloudBackendUrl` abort；站點仍本機路由。 | `disconnect-cloud-block-2.5s-branch-qa.json` | `repro-disconnect-cloud-block-2.5s.mjs` |
| 4 | H3 | `fromCache` 未處理 | 未依 metadata 顯示中斷。 | 程式審查 | dbg metadata |
| 5 | H4 | `isActive()` 不代表連線健康 | 斷網後 listener 旗標仍 true。 | evidence JSON | 斷網時 `forceRefetch` reject 路徑 |

**Main**：`2f9b2bf` 無此 banner；失敗 2 為 **本 PR UX 未達標**。

### 失敗 2 本輪實跑（分支 `branch-qa`）

| 情境 | 結果 |
|------|------|
| (a) 瀏覽器斷網 30s | **FAIL** — 期間未出現 banner |
| (b) 雲端 URL 阻斷 2.5s + 再觀察 30s | **FAIL** — 未出現 banner |

---

## 請後端唯讀查證（僅問題，請勿要求 agent 填答案）

店別 `zz-qa-store-a`、機台 `stb-01`：

1. 機台文件完整 Firestore 路徑是否與 `Paths.deviceDocPath(storeId, deviceId)` 一致？
2. 「在線」與「最後心跳」的 **欄位名**各為何？是否存在易與 300s 節流紀錄混淆的欄位？
3. repro 時段內，上述欄位與 **online 批次排程**、**有效心跳更新** 的因果關係如何解讀（勿用紀錄寫入時間冒充心跳）？
4. `online` 批次排程週期是否為 2min？與前端應等待的最長窗口建議？
5. 雲端判定在線是否同時要求 **online=true** 且心跳 **&lt;3min**？
6. controller `devLogin` 身分對該 doc 的 **Firestore get** 與 **listen** 是否皆允許且內容一致？
7. 若 REST 代理與 Firestore SDK 讀到不同視圖，常見原因為何（僅說明，不改 rules）？

回覆可存 `artifacts/pr101-diag/evidence/backend-device-facts.json`（由人填，非 agent 寫雲端資料）。

---

## 回歸測試

| 檔案 | 說明 |
|------|------|
| `tests/e2e/pr101-zz-qa-store-a-board-online-live-cloud.spec.mjs` | 失敗 1 live |
| `tests/e2e/pr101-zz-qa-store-a-realtime-disconnect-live-cloud.spec.mjs` | 失敗 2a live（30s offline） |
| `tests/controller-pr101-realtime-device-heartbeat.test.js` | 結構：poll skip、`tickClock` |

---

## 建議修復方向（本輪不實作）

1. **失敗 1**：恢復低頻 device 讀取或本地 age 重算；對齊 B1–B4；snapshot/REST 一致。
2. **失敗 2**：處理 SDK 離線模式（`offline` 事件、`metadata.fromCache`、listener error 以外路徑）以顯示 banner。

---

## 參考

- QA `b2e36a1` / PR #101
- `artifacts/controller-no-poll/REPORT.md`（CI 基準）
