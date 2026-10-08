# PR #27 公開 QA 失敗 — 交件報告（2026-10-08）

## 判定

| 項目 | 結論 |
|------|------|
| **產品 vs 腳本** | **QA 腳本問題**（非 s999999 403 跨店污染） |
| **一句原因** | Playwright `waitForFunction` 把 `{ timeout }` 當成 predicate 參數 + `STORE_MAIN` 未注入，造成 120s 假逾時；清空看板未等 DOM 同步加劇 c 失敗。 |

## PR / HEAD / CI

- PR：https://github.com/UltronService/milksha-demo/pull/28
- HEAD：`4f27cb7`（分支 `cursor/public-pages-qa-script-fix-49e5`）
- CI：見 PR #28 Actions（本地 unit + 新 e2e `forbidden-store-then-qa-isolation` 已過）

## 重現（公開網址，無 8877、無 disable-web-security）

| 測試 | 結果 |
|------|------|
| 全新瀏覽器 c×3（修正腳本 `public-pages-pr27-live-qa.mjs`） | **PASS** 3/3 |
| d→c 同 context 污染探針（`public-pages-pr27-investigate.mjs`） | 2/3 pass；失敗時 **paused=false**、無 403 halt 殘留 |
| legacy-key a–e（修正腳本） | fresh **全過**；old-settings **c** 1 輪雲端偶發 a 板無號 |

403 僅存在各分頁 `auth-session` 記憶體；`localStorage` 無全域 halt key。`s999999` 後開 zz-qa **2s 內可連**。

## 通過矩陣（修正腳本單次主流程）

| 檢查 | fresh | old-settings |
|------|-------|----------------|
| a | PASS | PASS |
| b | PASS | PASS |
| c | PASS | FAIL（r1 雲端 flake） |
| d | PASS | PASS |
| e | PASS | PASS |

## devLogin 量與「卡住」關係（補充）

後端 10/3–10/8 POST 約 3,481（120 IP、HeadlessChrome、8877+公開 referer）；10/8 00–01 台北短爆發非 3s 長串。

| 實測（公開 Pages） | idle 期間 devLogin |
|--------------------|-------------------|
| 全新瀏覽器 `s999999`「連線暫停」開 **5 分鐘** | **0**（進頁 1 次 403） |
| `zz-qa-store-a` 看板+控制端連線後 **10 分鐘** | **0**（就緒前 2 次） |

**一句結論：** 登入次數偏高是 **自動測試重跑** 造成，與 QA 卡 120s／「連線暫停」**不是同一根因**（產品 idle 無 devLogin 迴圈）。

## 報告路徑

- `artifacts/pr27-investigate/VERDICT.md`
- `artifacts/pr27-investigate/DELIVERY-REPORT.md`（本檔）
- `artifacts/pr27-investigate/report.json`
- `artifacts/pr27-devlogin-count/report.json`
- `artifacts/pr27live/results.json`
- 腳本：`scripts/public-pages-pr27-live-qa.mjs`、`scripts/public-pages-pr27-investigate.mjs`、`scripts/public-pages-devlogin-count.mjs`
