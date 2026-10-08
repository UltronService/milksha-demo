# PR #27 公開 QA — 交件報告（最終更新 2026-10-08）

## 兩個 PR（合併順序：**#30 產品 → #28 QA**）

| PR | 連結 | HEAD | CI（GitHub） |
|----|------|------|----------------|
| **#30 產品** | https://github.com/UltronService/milksha-demo/pull/30 | `48ec8b8` | **綠**（Actions run 37724906044） |
| **#28 QA** | https://github.com/UltronService/milksha-demo/pull/28 | `ed1ebdb` | **綠**（Actions run 37724934202） |

兩 PR 均已 **非草稿**；mergeable 以 GitHub UI 為準（CI 已過）。

---

## 1. `stale_empty_cloud` 處理（#30）

- **已移除** `stale_empty_cloud`：競態改由 **`pendingCommand.boardSeq` / `device.boardSeq`** 對齊；較舊 seq 的空板由 `shouldAcceptBoard` 拒絕，**不會**用「不清空」擋住真正清空。
- **真正清空**（單元測試已覆蓋）：
  - `push` → `clear_now`（device 指令）→ 看板空；
  - 雲端 **較新 seq 空名單**（POS）→ `pollBoard` 套用後空；
  - 冷啟動 `pollBoard` 讀到空雲端板 → 空。
- 單元測試檔：`tests/cloud-runtime-device-command-seq.test.js`（**6** 案例）。

### 單元測試 / e2e（產品分支本機）

| 項目 | 結果 |
|------|------|
| `npm test` | **135 / 135** 通過（含 seq 測試） |
| `npm run test:e2e`（本機 `48ec8b8`） | **118 通過、2 失敗、4 skip**（約 25.6m） |
| 本機 e2e 失敗 | `guest-clock.spec.mjs` ring-fit（字型量測 flake）；`home-board-background-6min.spec.mjs`（長時背景） |
| **CI e2e（#30）** | **綠**（與本機長測 flake 無關） |

公開矩陣 **b / e** 在注入修正後仍 **通過**（含 `cleared: true`、離線恢復後再送號），與「清空必須變空」一致。

---

## 2. 公開矩陣 `public-pages-pr27-matrix.mjs`（`PR27_MATRIX_RUNS=3`）

### 對照：不注入（`MILKSHA_QA_PATCH_RUNTIME=0`）

- 路徑：`artifacts/pr27-matrix/matrix-baseline-no-patch.json`
- 總結果：**`pass: false`**（3 輪 exit code 皆 1）

| 輪次 | 主要失敗原因（非通過即記錄，重跑不抵銷） |
|------|------------------------------------------|
| matrix-1 | **fresh c：3/3 輪通過**；**fresh d**：`page.goto` **ERR_TIMED_OUT**（`zz-deny-test`）；**old-settings c**：`waitForFunction` 45s；**old-settings d**：goto timeout |
| matrix-2 | 同：**d** 網路 timeout；**old-settings c** 45s |
| matrix-3 | 同：**d** timeout；**old-settings c** 45s |

說明：對照組 **未** 穩定「全紅 c」；matrix-1 曾 **fresh c 全過**，但 **d** 因 GitHub Pages / 網路 timeout 失敗（非產品 seq）。

### 注入產品 runtime（`MILKSHA_QA_PATCH_RUNTIME=1` + `origin/cursor/board-device-command-seq-49e5` 的 `cloud-runtime.js`）

- 路徑：`artifacts/pr27-matrix/matrix-with-patch.json`（由 `matrix.json` 複製；log：`matrix-with-patch.log`）
- 總結果：**`pass: false`**

| 輪次 | 失敗 |
|------|------|
| matrix-1～3 | **fresh c**、**old-settings c**：`waitForFunction` **90s**（隔離段逾時）；**a/b/d/e** 多數通過（含 **d** live `zz-deny-test`、**e**） |

補跑 1 輪：`artifacts/pr27-matrix/matrix-with-patch-retry1.json` — 同上，**c** 雙 context 90s 失敗。

單次主流程（注入）：`artifacts/pr27live/results.json`（2026-10-08T04:32Z）— **c** 雙 context 90s 失敗；**c030020Final** 空板 OK。

**結論（矩陣）：** 目前 **無法** 宣告「注入後連續 3 次 fresh + legacy 全 a–e 通過」。阻塞在 **公開雲端隔離 c 段 90s 逾時**（與 **d** 的 Pages 網路 timeout 並存），需另排重跑或拉長/穩定網路；**產品 seq 單元測試與 CI 已綠**。

---

## 3. 檢查 d（`zz-deny-test`）

- 探針：`artifacts/pr27-zz-deny-d/report.json`
- 矩陣注入跑：**d** 在 retry1 與多輪矩陣中 **通過**（live 403）；對照組 **d** 多因 **goto timeout** 失敗。

---

## 4. 測試規則

寫入僅 `zz-qa-*`；不在名單僅 `zz-deny-test`；不碰 `s120030`；`c030020` 只讀。

---

## 5. 12:30 台北狀態

| 完成 | 未完成 |
|------|--------|
| 拆 PR、移除 stale_empty、seq 單測、#30/#28 CI 綠 | 公開矩陣 **注入版 3×3 全過** |
| 對照矩陣 JSON、失敗原因表 | 本機長 e2e 2 項 flake（CI 已綠） |

**建議新時間：** 若需矩陣注入 3 輪全綠，另約 **2～3 小時**（每輪 ~35～45 分 × 3，且需避開 Pages timeout 高峰）；可先合 **#30** 再部署 Pages 後用 **無注入** 重跑矩陣驗收。
