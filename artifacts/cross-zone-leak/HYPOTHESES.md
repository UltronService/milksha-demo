## Hypothesis 0 — 三欄對照（cycles 27–29）

**定案：B)** 測試／腳本**未**以正常流程把 7112 從 prep 改 ready（無 `btn-one-ready`、無對 7112 下單）；`push_numbers` **意圖上** ready／preparing 皆不含 7112，但 Firestore `today_board`（與 board 收到的 snapshot apply）已把 **7112 列在 ready**；看板 DOM／`getSnapshot()` 與雲端一致 — **非看板錯分（非 C）**；請後端查 `push_numbers` 寫入／合併。來源 run [38182993862](https://github.com/UltronService/milksha-demo/actions/runs/38182993862)；後續 run 已加 push／`readBoard` 擷取（`hypothesis0-cycle-table.json`）。

| Cycle | (1) push_numbers 直前（preparing / ready） | (2) Firestore `today_board` | (3) `getSnapshot()` + ready DOM slots | ABC |
| --- | --- | --- | --- | --- |
| 27 | **腳本意圖**：prep `7100–7111`+`7200–7226`、ready `8100–8111`，**皆無 7112**（該 run 無 HTTP 錄影；見 `run-real-cloud-cross-zone-red.mjs` seed） | **7112∈ready**、prep 38 筆無 7112（leak 前 apply len=50, prep=38, ready=12；snapshot.ready 已含 7112 ⇒ `From_Store_OK`） | ready 尾端 `…8101,7112`；slots `0:8101` `1:7112` | **B** |
| 28 | 同 27 | 同 27（ready=12 含 7112） | 同型；slots `0:8101` `1:7112` | **B** |
| 29 | 同 27 | 同 27 | 同型；slots `0:8101` `1:7112` | **B** |

**排除 A（測試正常 prep→ready 但期望沒跟上）：** 7112 從未作為一張票送進 controller；`bumpNumberFieldAfterSend` 只在欄位顯示 7112，不會自動進 ready。若未來 push 錄影顯示 `params.ready` 含 7112，才改判 **A**（送端／期望 bug）。

**排除 C：** 若雲端 doc 為 ready，看板 `partitionNumberContent` / `applyPayload`（`js/milksha-board.js` 164–232、1148–1149）本來就會放進 `readyItems` — 與觀測一致，非「doc prep、board ready」。

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
