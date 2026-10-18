# Controller no-poll — 實作與驗收報告

## Head / CI（最新）

| 項目 | 值 |
|------|-----|
| **PR** | https://github.com/UltronService/milksha-demo/pull/101 |
| **Head commit** | `b579bcd` |
| **CI run（驗收用）** | https://github.com/UltronService/milksha-demo/actions/runs/39132334019（`ab3284c`，conclusion: failure；§2 對照） |
| **CI run（前次）** | https://github.com/UltronService/milksha-demo/actions/runs/39129671976（`9ee74de`） |

---

## 1. Firestore 讀取次數：實測（fake-cloud REST）

### 情境（與 PLAN 一致）

- 店別：`zz-qa-store-a`（僅 QA）
- 單頁控制端已連線、看板同 context 先開啟心跳後關閉看板 tab、控制端顯示「在線」、**idle 60s**、無叫號
- 計數：fake-cloud `GET /test/controllerDocGetCounts`（每次 Firestore REST `GET` 單一 document 累加 `today_board` / `devices/{deviceId}`）

### 量測指令

```bash
npx playwright install chromium
# 本分支（site = 目前 checkout）
node artifacts/controller-no-poll/measure-idle-reads.mjs --idle-sec=60

# main @ 2f9b2bf（僅 controller 靜態資源來自 worktree；fake-cloud 用本 repo 含計數端點）
git worktree add artifacts/controller-no-poll/main-worktree main   # 首次
MILKSHA_SITE_ROOT=$PWD/artifacts/controller-no-poll/main-worktree \
  node artifacts/controller-no-poll/measure-idle-reads.mjs --idle-sec=60
```

### 實測結果（idle 60s 窗口內）

| Site git | 路徑 | today_board GET | devices GET | 合計 | 換算 **合計/小時** |
|----------|------|-----------------|-------------|------|-------------------|
| `2f9b2bf`（main） | `measure-idle-reads-site-2f9b2bf-repo-9ee74de.json` | 15 | 15 | **30** | **1,800** |
| `9ee74de`（本分支） | `measure-idle-reads-site-9ee74de-repo-9ee74de.json` | 0 | 0 | **0** | **0** |

- main：與理論 4s×2×(60/4)=30 一致 → **~1,800 reads/h/控制頁**。
- 本分支（fake-cloud **rest-wake**）：steady idle **0**；換店後若看板尚未在線，僅 **catch-up**（2s 間隔、最多 45s、上線即停），**不**影響「已上線後 idle 60s」量測。

### 正式雲端 onSnapshot（**非本次 fake-cloud 實測**）

| 項目 | 說明 |
|------|------|
| **實測** | 僅上表 fake-cloud REST（CI/本機可重現）。 |
| **推算** | 真實 `mode=cloud` + 正式 API key：`onSnapshot` 初次各 1 snapshot，idle 無資料變更時 **無 steady-state REST poll**；斷線重連後 `forceRefetch` 各 1 次 `get()`。未連正式 milksha-qms-dev（依 owner 限制）。 |

---

## 2. CI 失敗對照 main 38 項基準

基準檔：`artifacts/ci-nightly/main-baseline-failures-39105020723.txt`（36 + addendum 2 = **38**）。  
對照方式：以 **spec 檔名 + 測試標題** 匹配（行號可與基準不同）。

### Run 39132334019（`ab3284c`）失敗用例

| # | 失敗用例（去重） | 在 38 基準？ |
|---|------------------|-------------|
| 1 | `pr23-login-count.spec.mjs` › 5 min normal board idle | ✅ addendum |
| 2 | `cloud-remote-send.spec.mjs` › ten sends produce ten numbers and clear works | ✅ addendum |
| 3 | `board-cell-peak-simulation.spec.mjs` › 3-min peak run… | ✅ |
| 4 | `cloud-qa-checklist.spec.mjs` › network cable pull and restore… | ✅ |
| 5 | `controller-post-send-board-read-abort.spec.mjs` › push_numbers HTTP 500… | ✅ |
| 6 | `controller-source-quick-send.spec.mjs` › local quick send… | ✅ |
| 7 | `controller-store-picker-evidence.spec.mjs` › 3c two minutes… | ✅ |
| 8 | `controller-store-picker.spec.mjs` › new store appears within poll window… | ✅ |
| 9 | `fresh-browser-pause-heartbeat.spec.mjs` › boxHeartbeat 403… | ✅ |
| 10 | `home-board-art-alignment.spec.mjs` › landscape art grid… @ 1920 | ✅ |
| 11 | `home-board-art-alignment.spec.mjs` › landscape art grid… @ 3840 | ✅ |
| 12 | `home-board-cloud-recovery.spec.mjs` › B-N07: 60s blocked routes… | ✅ |
| 13 | `home-board-quick-send-one.spec.mjs` › ten quick sends… | ✅ |
| 14 | `home-board-stale-storage.spec.mjs` › stale cloud settings… | ✅ |
| 15–17 | `home-board-ten-send-clear.spec.mjs` › local-link … 清空看板（3 variants） | ✅ |

**分支獨有失敗數：0**（上表每一項皆落在 38 項基準內）。

本 run **未**失敗、且 **不在 38 項** 的用例（前次 CI 曾出現）：

| 用例 | 處置 |
|------|------|
| `cloud-remote-send.spec.mjs` › controller before board opened… | 見下方 triple probe |
| `controller-store-picker.spec.mjs` › switching store waits for heartbeat… | `ab3284c` CI 未再失敗；catch-up 已合入 |

### Triple probe：`controller before board opened`（不在 38 項）

依 owner 要求：`MILKSHA_CI_TIER=pr` + 同 `playwright.config.js`，main `2f9b2bf` 與分支各 **3 次**：

| Ref | 結果 | 紀錄 |
|-----|------|------|
| main @ `2f9b2bf` | **3/3 PASS** | `artifacts/controller-no-poll/triple-cloud-remote-before-board-main.log` |
| 分支 @ `ab3284c` | **3/3 PASS** | `artifacts/controller-no-poll/triple-cloud-remote-before-board-branch.log` |

說明：`39132334019` failed log **無**此用例；main／分支本機 triple 皆綠 → **非分支獨有回歸**，不列入分支獨有失敗。摘要：`triple-probe-cloud-remote-before-board.md`。

---

## 3. 變更摘要（供 QA）

- 正式雲端：4s REST poll → `onSnapshot` + 斷線 banner / 退避 / 重連單次 refetch。
- Fake-cloud：`rest-wake` + 換店 catch-up（非 steady 4s poll）。
- 30s `listStores` 未改。
- 測試：`controller-polling`、`controller-realtime-sync`、`controller-cloud-rest-wake`。
- Fake-cloud 測試用：`/test/controllerDocGetCounts`（僅計數，不影響正式上線）。

## 4. 手動 UAT（zz-qa-store-a）

1. 開控制端 cloud 連線 → idle 1 分鐘 → Network 無每 4s 重複 GET。
2. 看板改號 → 控制端清單即時更新（正式環境為 push）。
3. 斷線 →「即時同步中斷…」→ 恢復後清除。
