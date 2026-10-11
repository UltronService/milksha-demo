# Cross-zone 滲漏診斷（prep 7112 出現在 ready 區）

## 真雲 RED 已實跑（非預期）

| 項目 | 結果 |
|------|------|
| GHA | https://github.com/UltronService/milksha-demo/actions/runs/38182993862 |
| Store | `zz-qa-ci-store`（結束 `clear_now` + 停模擬） |
| 腳本 | `run-real-cloud-cross-zone-red.mjs` → **exit 1** |
| 30 輪 1080p | **19** 違規事件、**3** 種唯一（cycle **27–29**） |
| 離線 burst 重播 | `run-offline-replay-red.mjs` → exit **0**（假雲無法 RED） |

**代表失敗幀：** ready **2/2**，slot0=`8101`、slot1=**`7112`**（`data-item-id=store:7112`），動畫 **layer-float×10**；該輪 mid-send 後僅 **1 次** apply（len=50, prep=38, ready=12, silent=false）直前即出現。詳見 `real-cloud-red-failing-frames.json`、`REAL-CLOUD-RED-RUN.md`。

**重要：** `getSnapshot().ready` **已包含 `7112`** — 客戶可見症狀來自 **runtime state 把 prep 號排進 ready 列表**，不只是 DOM 殘影。

**偵測調整：** 10 輪 GHA 曾全綠（run `38182681355`）；改 **30 輪** + ready settled 時 **prep `7xxx` in slot** 後 RED 穩定。

---

## 最小序列

12 prep + 12 ready → 每輪 **5200ms** → mid prep **7200+c** → 採樣至 **6500ms**；leak 在後段輪次（27+）仍可出現 **7112**（第 13 筆 prep 語意）。

---

## 假設（排序）

1. **`applyPayload` / 雲端列表合併時，prep 票被 append 進 `readyItems`（`js/milksha-board.js` `applyPayload`）** — 驗證：在 `applyPayload` 入口記錄每筆 `From_Store_OK` vs `Preparing` 與合併後 `readyItems` 尾端；預測：出現 leak 的 apply 後 `readyItems` 含 `7112` 且 `preparing` 亦含。  
2. **Page-turn 中 `layer-float` clone 未清除，chip 掛入錯 zone 的 slot（`js/board/milksha-board-anim.js` `pageTurn` / `removeOrphanLayerFloatChips`）** — 驗證：leak 幀比對 float 數與 slot `itemId` 是否來自 prep；預測：`floatChips>0` 時 slot1 的 7112 與 prep chip 同 id。  
3. **真雲連續 `board_snapshot` 使 `cloud-runtime.js` `applyNumberContent` 在動畫中途覆寫 state（`js/receiver/cloud-runtime.js`）** — 驗證：對照 `__pr53Diag.applyPayloadCalls` 與 Firestore timeline；預測：leak 前單次 apply 帶 **ready=12 且列表含 7112**。  
4. **末頁僅 2 格應顯示時，layout 把 prep 第 13 筆填進 ready page-2 slot1（`layoutPageGrid` / page index）** — 驗證：leak 時 `readyPage` 與 `layoutPageGrid(readyItems, page)` 輸出；預測：page2 slot1 被指派 `7112` 的 cell。  
5. **#53 延後 indicator 與此 bug 無關；revert 後仍 RED** — 驗證：4146812 site 上 30 輪 RED；預測：revert 不能消除 7112 in ready snapshot。  

---

## 建議修復測試邊界（3–5 項）

1. 真雲 `zz-qa-ci-store`：30 輪 page-turn + mid prep，**零** prep `7xxx` 出現在 ready **slot**；`getSnapshot().ready` 不得含 prep 號。  
2. 單輪：ready **2/2** 僅 slot0–1 為 `{8101,8100}`（或當頁 10 格與 snapshot 一致）。  
3. Page-turn + **1×** 全量 apply 後，**layer-float** 計數為 0。  
4. 連續 **5×** silent+non-silent apply 模擬 snapshot 風暴，slot 與 snapshot 仍一致。  
5. 1080 與 4K 各 10 輪，cross-zone 事件為 0。  

---

## 產物

- `run-real-cloud-cross-zone-red.mjs` / `cross-zone-leak-diagnose.yml`  
- `real-cloud-red-result.json`、`real-cloud-red-failing-frames.json`  
- `evidence-30round-cycle0.json`（前次 30 輪對照）  
- `run-offline-replay-red.mjs` + `offline-replay-red-result.json`  
