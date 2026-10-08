# PR #27 公開 QA — 交件報告（2026-10-08）

## 狀態（台北 17:45 目標）

| 項目 | 狀態 |
|------|------|
| **#30** `384c397` | 問題 1／2／3 + CI 修復（e2e 勿 `fuser -k 8877`）；**CI 綠** run `37756344049` |
| **#28** `34eb8ac` | github.io 整站 route + 矩陣腳本（main 對照沿用 `main-a82cb9b.json`） |
| **矩陣 product 3×3** | **通過** `product-f781689.json`（fresh + old-settings，a–e 各 3 輪） |
| **矩陣 main 對照** | 沿用既有 `main-a82cb9b.json`（未重跑） |
| **CI** | #28 綠；#30 綠（`384c397`，見下「CI 根因」） |

---

## 驗收方式

- 瀏覽器 URL 維持 `https://ultronservice.github.io/milksha-demo`（CORS）。
- Playwright 將該路徑下**所有靜態資源**改由本機 worktree 回檔（`scripts/lib/github-pages-site-route.mjs`）。
- `config/firebase.js` 以 `inject-firebase-config.mjs` 注入。
- **不**攔截 cloudfunctions / securetoken / firestore。

腳本：`PR27_MATRIX_SKIP_MAIN=1 PR27_MATRIX_RUNS=3 node scripts/local-branch-pr27-matrix-suite.mjs`  
產物：`artifacts/pr27-pages-route-matrix/product-f781689.json`、`summary.json`

---

## 矩陣結果

### product `#30` `product-f781689.json`

- **3 次連跑**：fresh / old-settings 皆 **a–e 全過**（含 **c**：先 clear 再 push，順序未改）。
- `summary.json`：`pass: true`，`product: true`。

### main 對照 `main-a82cb9b.json`

- 沿用先前結果（c 曾多輪逾時）；本回合未重跑。

---

## #30 修復摘要

1. **問題 1：** `resolveCommandBoardSeq`（`cmd.boardSeq` → 雲端 `today_board.seq`）。
2. **問題 2：** missing `today_board` 不遞增 `localSeq`。
3. **問題 3：** `clear_now` 若早於已顯示的 `today_board`（`issuedAtMs` vs `updatedAt`）則忽略並 heartbeat ack；合法清空不自行 `localSeq+1`。

**單元：** `tests/cloud-runtime-device-command-seq.test.js`  
**e2e：** `home-board-clear-then-push-stale-command.spec.mjs`

---

## #30 CI 三次失敗根因（已修 `384c397`）

- **非產品：** `cloud-runtime.js` 無新增無限 poll；本機同 CI 跑 e2e 時 node+chrome RSS 約 **300MB** 級，無持續飆升。
- **測試：** `home-board-clear-then-push-stale-command` / `home-board-first-number-after-open` 的 `beforeAll` 曾 `fuser -k 8877`，殺掉 Playwright `webServer`。`f781689` 新增前者後，job `37752325437` 在 **09:03:25** 出現 `[WebServer] Killed`，後續 `home-board-layout` 等 **connection refused**（`edb63ed` 僅較晚單檔殺端口，剩餘測試少故仍過）。
- **修法：** 與 `home-board-cloud-recovery` 相同，只 `restartCloud()` + `startSite()`。

---

## 手動 UAT（非工程）

1. 開公開看板 `?mode=cloud&store=zz-qa-store-a`（或門市 c030020 測試店）。
2. 控制器：**先按清空、約 1 秒後送號**（與矩陣 c 相同）。
3. 看板應出現號碼，**等 10 秒**後號碼仍應在（不會被晚到的 clear 清掉）。
4. 再按清空：看板應變空。
