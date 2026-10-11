## Hypothesis 0 — 三欄對照（cycles 27–29）

**Verdict（信心）：B — _likely_，非 _proven_**  
- **Proven 缺什麼：** run [38182993862](https://github.com/UltronService/milksha-demo/actions/runs/38182993862) **無** `push_numbers` HTTP 錄影、**無** leak 當下 `readBoard()`；capture run [38184430601](https://github.com/UltronService/milksha-demo/actions/runs/38184430601) **全綠**未重現。  
- **Likely 依據：** 下表 col(2) 由 **apply 輸入 + snapshot** 推得；col(1) 由 **腳本原始碼**（無 7112 下單）+ 待 capture 之 push hook。  
- **C 尚未排除：** 若 board 在 `partitionNumberContent` 誤分，**apply 與 snapshot 也會同時含 7112∈ready** — 要判 C 需 **Firestore/readBoard 顯示 7112=preparing 且 apply item 為 Preparing**（見 `hypothesis0-apply-trace.json` 每筆 `number`+`source_type`）。  
- **7112 從哪來（若腳本未送）：** 可能為 **後端寫入/合併**、**上一輪 store 殘留**（38182681355 07:01–07:05 全綠後 1 分鐘即開本 run）、或 **欄位 7112 被誤送** — 需 capture 對照 push vs doc。

**共用 CI store 重疊（38182993862 窗 07:06:22–07:16:57 台北）：** 見 `hypothesis0-ci-overlap.md` — **`live-cloud-zz-qa-ci-store` 與 `ci.yml` e2e-live-cloud 相同**；該窗 **僅 cross-zone-red**，e2e-live-cloud **07:16:59** 才開跑。**H0-other-writer：該窗 _unlikely_**（PR #52/#55/#59/#57 無重疊 run；repo 內 tests **無字面 7112**）。

| Cycle | (1) push_numbers 直前 | (2) Firestore / apply | (3) getSnapshot + ready slots | ABC | 信心 |
| --- | --- | --- | --- | --- | --- |
| 27 | 腳本意圖：無 7112（**無 HTTP 錄影**） | apply：ready=12 含 7112（**推定** `From_Store_OK`）；**待 readBoard 證實** | `…8101,7112`；slots `0:8101` `1:7112` | B* | likely |
| 28 | 同 27 | 同 27 | 同型 | B* | likely |
| 29 | 同 27 | 同 27 | 同型 | B* | likely |

\*ABC 在 **live capture**（workflow `cross-zone-hypothesis0-capture.yml`）產出 `push`+`firestore`+`hypothesis0-apply-trace.json` 後可升級 **proven** 或改判 A/C。

---


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

## 假設（排序，Hypothesis 0 後）

0. **（已定案 B）雲端 `today_board` 將 7112 標 ready，看板照單全收** — 送端腳本未送 7112；後端寫入／合併待查。  
1. **後端 `push_numbers` 或 doc 合併把「未送出的 7112」或 prep 列誤寫入 ready（取代 8100）** — 用新 hook 對照每輪 `params` vs `readBoard()`。  
2. **Page-turn `layer-float` 造成誤判 cross-zone，但 snapshot 已含 7112** — 動畫為加重因素，非根因。  
3. **#53 revert 後仍 RED** — 已證；與 page-turn indicator 無關。  
4. **layout 單獨把 prep 填 ready slot 但 snapshot 無 7112** — Hypothesis 0 已否決（snapshot 與 doc 同為 ready）。  

---

## 建議修復測試邊界（3–5 項）

1. 真雲：30 輪後 **Firestore `today_board` 與 `push_numbers` 一致**；ready 不得含未送單的 prep 序號（如 7112）。  
2. 看板：`getSnapshot().ready` 與 Firestore ready 列表一致；ready **2/2** slot 與 snapshot 同頁一致（期望 `{8101,8100}` 當 seed 未變）。  
3. Page-turn + **1×** 全量 apply 後，**layer-float** 計數為 0。  
4. 連續 **5×** silent+non-silent apply 模擬 snapshot 風暴，slot 與 snapshot 仍一致。  
5. 1080 與 4K 各 10 輪，cross-zone 事件為 0。  

---

## 產物

- `run-real-cloud-cross-zone-red.mjs` / `cross-zone-leak-diagnose.yml`  
- `real-cloud-red-result.json`、`real-cloud-red-failing-frames.json`  
- `evidence-30round-cycle0.json`（前次 30 輪對照）  
- `run-offline-replay-red.mjs` + `offline-replay-red-result.json`  
