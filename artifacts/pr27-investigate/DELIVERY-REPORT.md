# PR #27 公開 QA — 交件報告

## 根因一句（注入後 c 90s）

**分類 (b) + (a)：** #30 初版在 `pendingCommand` 無 `boardSeq` 時**直接使用偏低的 `device.boardSeq`**（heartbeat 落後），本地以過小 seq 顯示號碼後，**較大 seq 的空雲端板**仍會通過 `shouldAcceptBoard` 並清空 DOM → c 等不到號；**單檔注入 Pages** 亦與已部署 JS 混版，不適合作產品驗收。**已修：** `a1372a0` 改為 **`cmd.boardSeq` → 雲端 `today_board.seq`（忽略過期 device.boardSeq）**；驗收改 **本機 :8877 整棵分支**（見下）。

---

## PR

| PR | HEAD | CI |
|----|------|-----|
| [#30 產品](https://github.com/UltronService/milksha-demo/pull/30) | `a1372a0` | 見 Actions |
| [#28 QA](https://github.com/UltronService/milksha-demo/pull/28) | （本分支 push 後） | 見 Actions |

合併順序：**#30 → #28**。

證據：`artifacts/pr27-forensics/root-cause-pages-patch.json`（注入生效 `receiver-demo-2026-10-08-boardseq`；poll 空板 seq 499 在 localSeq 0 時被接受）。

---

## 本機矩陣（:8877，真雲端，不注入）

腳本：`node scripts/local-branch-pr27-matrix-suite.mjs`  
環境：`MILKSHA_SITE_ROOT` = `wt-main`（a82cb9b）或 `wt-product`（#30）；`MILKSHA_QA_PATCH_RUNTIME=0`。

| 輸出 | 說明 |
|------|------|
| `artifacts/pr27-local-matrix/main-a82cb9b.json` | 對照：c 可偶發失敗 |
| `artifacts/pr27-local-matrix/product-a1372a0.json` | 預期 3× fresh + legacy 全 a–e |
| `artifacts/pr27-local-matrix/summary.json` | 總表 |

（跑完後補每輪失敗原因；重跑不抵銷。）

---

## 單元測試

`npm test`：**136**（含 stale `device.boardSeq`、清空三情境）。

---

## 規則

寫入 `zz-qa-*`；否絕 `zz-deny-test`；不碰 `s120030`；`c030020` 只讀。
