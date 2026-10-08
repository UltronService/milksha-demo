# PR #27 公開 QA — 交件報告（2026-10-08 12:30 台北）

## 判定摘要

| 項目 | 結論 |
|------|------|
| **120s 卡測** | **(a) QA 腳本**（`waitForFunction` 參數／清空同步） |
| **c 收不到號** | **(b) 看板 seq 競態**（`cloud-runtime` 修復見 PR #28） |
| **跨店 403 污染** | **否**（halt 僅分頁記憶體） |

PR：https://github.com/UltronService/milksha-demo/pull/28

---

## 檢查 d — `zz-deny-test`（後端 **9940daf**）

**禁止**再用 `s999999` 或其他未列入白名單的假店開看板（會被 device 自動登記）。  
「不在名單」統一用 **`zz-deny-test`**：`devLogin` / `devCommand` / `listStores` 皆 **403 `store_not_allowed`**，且不登記。

### 主驗證（公開網址實測）

| 項目 | 結果 |
|------|------|
| URL | `https://ultronservice.github.io/milksha-demo/?mode=cloud&store=zz-deny-test` |
| UI | **連線暫停** |
| devLogin HTTP | **403**，body.code = **`store_not_allowed`** |
| 進頁 devLogin 次數 | **1** |
| 暫停後 idle **15s**（探針）／**60s**（主腳本 d） | **0** 次重試 |

證據：`artifacts/pr27-zz-deny-d/report.json`（2026-10-08T03:46:37Z）

主流程腳本：`scripts/public-pages-pr27-live-qa.mjs` 檢查 **d** 使用 **live_cloud + zz-deny-test**（獨立 browser context，無 route）。

### 補充（route 模擬）

仍保留 **c030020** 看板 URL + Playwright route 模擬 devLogin 403，結果寫在每筆 **d** 的 `routeSupplement` 欄位（不取代主驗證）。

---

## 403 其他 code（看板，route 探針）

`store_id_invalid`、`dev_store_registry_full` 在 **devLogin 403** 時亦顯示「連線暫停」、idle 無迴圈（見 `artifacts/pr27-403-codes-probe/report.json`）。  
`markUploadHaltedFrom403` 白名單未含後兩者；**devLogin** 路徑仍經 `noteDevLoginFailure(403)` → 暫停（未改產品，待總監）。

---

## devLogin 量（補充）

**一句結論：** 10/3–10/8 約 3.5k 次為 **QA 重跑**；與 idle 卡頁 **非同一根因**（暫停探針用 **zz-deny-test** 實測 5 分鐘 idle = 0）。

---

## c 根因與修復

見 `artifacts/pr27-investigate/FAILURE-ROOT-CAUSE.md`（分類 **(b)**）。  
Pages 未部署修復前，可用 `MILKSHA_QA_PATCH_RUNTIME=1` 注入 `cloud-runtime.js` 跑矩陣。

---

## 手動驗收（d）

1. 開無痕：`…/milksha-demo/?mode=cloud&store=zz-deny-test`
2. 應顯示 **連線暫停**（非離線）
3. 開著 1 分鐘，Network 僅約 **1** 次 devLogin → 403
