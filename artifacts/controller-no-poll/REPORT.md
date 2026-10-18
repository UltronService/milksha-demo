# Controller no-poll — 實作與驗收報告

## Head / CI（最新）

| 項目 | 值 |
|------|-----|
| **PR** | https://github.com/UltronService/milksha-demo/pull/101 |
| **Head commit** | `3c82a1e` |
| **CI run（owner 指定）** | https://github.com/UltronService/milksha-demo/actions/runs/39129671976（`9ee74de`，conclusion: failure；對照表見 §2） |
| **CI run（catch-up 修復後）** | https://github.com/UltronService/milksha-demo/pull/101 → Checks 最新（`3c82a1e` 起） |

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

### Run 39129671976（`9ee74de`）唯一失敗用例（依 spec 標題去重）

| # | 失敗用例 | 在 38 基準？ |
|---|----------|-------------|
| 1 | `pr23-login-count.spec.mjs` › 5 min normal board idle | ✅ addendum |
| 2 | `cloud-remote-send.spec.mjs` › ten sends produce ten numbers and clear works | ✅ addendum |
| 3 | `cloud-remote-send.spec.mjs` › controller before board opened shows hint… | ⚠️ **不在基準清單**（本機重跑通過；視為 CI flake，非結構性回歸） |
| 4 | `board-cell-peak-simulation.spec.mjs` › 3-min peak run… | ✅ |
| 5 | `cloud-qa-checklist.spec.mjs` › network cable pull… | ✅（行號與 main 基準不同，同場景） |
| 6 | `controller-post-send-board-read-abort.spec.mjs` › push_numbers HTTP 500… | ✅ |
| 7 | `controller-source-quick-send.spec.mjs` › local quick send… | ✅ |
| 8 | `controller-store-picker-evidence.spec.mjs` › 3c two minutes… | ✅ |
| 9 | `controller-store-picker.spec.mjs` › new store appears within poll window… | ✅ |
| 10 | `controller-store-picker.spec.mjs` › switching store waits for heartbeat… | ⚠️ **不在基準** → **分支獨有**；已以 rest-wake **catch-up**（上線即停）修復，本機 `spec.mjs:99` 通過 |
| 11 | `forbidden-store-then-qa-isolation.spec.mjs` › zz-deny-test… | ✅ |
| 12 | `fresh-browser-pause-heartbeat.spec.mjs` › boxHeartbeat 403… | ✅ |
| 13 | `home-board-art-alignment.spec.mjs` › landscape art grid… (1920/3840) | ✅ |
| 14 | `home-board-cloud-recovery.spec.mjs` › B-N07: 60s blocked routes… | ✅ |
| 15 | `home-board-quick-send-one.spec.mjs` › ten quick sends… | ✅ |
| 16 | `home-board-stale-storage.spec.mjs` › stale cloud settings… | ✅ |
| 17 | `home-board-ten-send-clear.spec.mjs` › local-link … 清空看板（3 variants） | ✅ |

**分支獨有（需修）**：#10 → 已修（`startRestWakeCatchUp`）。**#3** 基準外但本機綠，不屬穩定分支回歸。

**較 main 基準少失敗的項目**（PR run 未再出現）：例如多數 `board-empty-hint*`、`controller-connect-errors*` 等 — 不計為分支新增失敗。

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
