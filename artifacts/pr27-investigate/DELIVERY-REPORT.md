# PR #27 公開 QA — 交件報告

## 根因一句（注入後 c 90s）

**分類 (a) + (b)：** 舊驗收用 **只換 `cloud-runtime.js`**，其餘仍為 Pages 已部署版 → **來源與模組版本不一致**；#30 初版又在 `pendingCommand` 無 `boardSeq` 時採 **過低的 `device.boardSeq`**，大 seq 空雲端板會蓋掉剛送的號。**已修 seq：** `a1372a0`。**驗收改：** Playwright 將 **`https://ultronservice.github.io/milksha-demo/*` 整站** 由本機分支檔回應（瀏覽器來源仍是 github.io，CORS 可過）；**不可用 `127.0.0.1:8877` 直連真雲端**（預檢無 `access-control-allow-origin`）。

---

## PR

| PR | HEAD | 說明 |
|----|------|------|
| [#30 產品](https://github.com/UltronService/milksha-demo/pull/30) | `a1372a0` | device command boardSeq |
| [#28 QA](https://github.com/UltronService/milksha-demo/pull/28) | 本分支 | `github-pages-site-route` + 矩陣腳本 |

合併順序：**#30 → #28**。

---

## 矩陣（Pages route，真雲端）

```bash
node scripts/local-branch-pr27-matrix-suite.mjs
```

| 輸出 | 說明 |
|------|------|
| `artifacts/pr27-pages-route-matrix/main-a82cb9b.json` | 對照；c 可偶發失敗 |
| `artifacts/pr27-pages-route-matrix/product-a1372a0.json` | 預期 3× fresh + legacy 全 a–e |
| `artifacts/pr27-pages-route-matrix/summary.json` | 總表 |

環境：`MILKSHA_PAGES_SITE_ROUTE=1`、`MILKSHA_SITE_ROOT` = `wt-main` 或 `wt-product`；執行前以 `inject-firebase-config.mjs` 寫入 worktree 的 `config/firebase.js`（等同 Pages 部署注入）；**不**攔截 cloudfunctions / securetoken / firestore。

---

## 本機 e2e（與 #30 無關）

`guest-clock` ring-fit（Roboto 字型斷言）在 **main 與 #30 worktree 皆失敗**（Linux 無 Roboto，實際 `DejaVu Sans`）。`home-board-background-6min` 未列入上述失敗。

---

## 規則

寫入 `zz-qa-*`；否絕 `zz-deny-test`；不碰 `s120030`；`c030020` 只讀。
