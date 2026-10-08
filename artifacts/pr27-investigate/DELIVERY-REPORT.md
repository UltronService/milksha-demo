# PR #27 公開 QA — 交件報告（2026-10-08）

## 狀態（台北 16:00+）

| 項目 | 狀態 |
|------|------|
| **#30** `edb63ed` | 兩項 seq 修復 + 單元／fake-cloud e2e 已 push；PR 說明已分問題 1／2 |
| **#28** `34eb8ac` | github.io 整站 route + 矩陣腳本已 push |
| **矩陣 product 3×3** | **未達標**（見下表）；**卡點：真雲端 c 隔離 90s** |
| **矩陣 main 對照** | 已跑完 3 次；**c 多輪逾時**（符合「main 可偶發失敗」） |
| **CI** | 見 GitHub Actions（#28、#30 需綠） |

---

## 驗收方式

- 瀏覽器 URL 維持 `https://ultronservice.github.io/milksha-demo`（CORS）。
- Playwright 將該路徑下**所有靜態資源**改由本機 worktree 回檔（`scripts/lib/github-pages-site-route.mjs`）。
- `config/firebase.js` 以 `inject-firebase-config.mjs` 注入（等同 Pages 部署）。
- **不**攔截 cloudfunctions / securetoken / firestore。

腳本：`node scripts/local-branch-pr27-matrix-suite.mjs`  
產物目錄：`artifacts/pr27-pages-route-matrix/`（已 push 至 #28 分支）。

---

## 矩陣結果（已寫入 JSON）

### main 對照 `main-a82cb9b.json`

| Run | fresh c | old-settings c | 備註 |
|-----|---------|----------------|------|
| 1 | fail 90s | fail 45s | fresh b 亦 fail（送號後清空） |
| 2 | fail 45s | fail 45s | |
| 3 | fail 90s | fail 90s | |

**失敗原因（c）：** `waitBoardMinReady` / 隔離輪 `waitForFunction` 逾時（號碼未在時限內出現在 `.milksha-ready`）。

### product `#30` `product-edb63ed.json`

| Run | fresh c | old-settings c | a–b,d,e |
|-----|---------|----------------|---------|
| 1 | fail 90s | fail 90s | 其餘 pass |
| 2 | fail 90s | fail 90s | 其餘 pass |
| 3 | fail 90s | fail 90s | 其餘 pass |

**失敗原因（c）：** 同上；單次手動重跑 `public-pages-pr27-live-qa.mjs`（`siteRoot=wt-product`）亦 **fresh/old-settings c 皆 fail**。

**未達「兩瀏覽器各連續 3 次 a–e 全過」；不得用重跑抵銷。**

---

## #30 兩項修復（PR 說明已對齊）

### 問題 1：先清空再送號被舊空名單清掉

- **修法：** `resolveCommandBoardSeq`（`cmd.boardSeq` → 雲端 `today_board.seq`）。
- **單元：** `tests/cloud-runtime-device-command-seq.test.js`（含 `stale device.boardSeq below cloud seq` 等）。
- **矩陣：** 預期 `product-edb63ed.json` 全過（**目前 c 未過**）。

### 問題 2：新店看板 404 抬高 localSeq

- **修法：** `applyMissingCloudBoard` **不再遞增 seq／不再空 apply**。
- **單元：** `missing board polls do not inflate localSeq; first small-seq board applies`
- **e2e：** `home-board-first-number-after-open.spec.mjs` → `fake-cloud: board open then first send shows number within 3s`（**通過**）

---

## 其他測試

- **home-board-background-6min（main）：** `npx playwright test tests/e2e/home-board-background-6min.spec.mjs` on `wt-main` **exit 0**（約 116s）。
- **guest-clock ring-fit（main）：** 仍 fail（Roboto 字型；與 #30 無關）。

---

## 注入 c 90s（歷史根因，已寫入）

**(a)** 僅注入單檔 `cloud-runtime.js` → 與 Pages 其他 JS **版本不一致**。  
**(b)** 問題 1 seq 邏輯（#30 已修）。  
現行驗收：**整站 github.io route**，不再單檔注入。

---

## 規則

寫入 `zz-qa-*`；否絕 `zz-deny-test`；不碰 `s120030`；`c030020` 只讀。
