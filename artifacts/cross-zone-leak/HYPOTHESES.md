## Hypothesis 0 — 三欄對照（cycles 27–29）

**Verdict：A — _proven_（後端 log + controller `push_numbers`）**  
雲端 **原樣儲存** controller 送出的 `ready=[7112]`（07:02:48.627 台北，seq 12525）；**不是** B（雲端 mislabel）。看板 snapshot/DOM 與 doc 一致 ⇒ **不是 C**（doc prep / board ready 分裂）。

| Cycle | (1) push_numbers（實際） | (2) Firestore / today_board | (3) getSnapshot + ready slots | ABC |
| --- | --- | --- | --- | --- |
| 27–29（leak 觀測 run [38182993862](https://github.com/UltronService/milksha-demo/actions/runs/38182993862)） | **07:02:48 已證** ready=**[7112]**、prep=7100–7111（[38182681355](https://github.com/UltronService/milksha-demo/actions/runs/38182681355) seed）；38182993862 起點 ~**07:06** clear 後 **同一 harness 會再 seed** | ready 含 **7112**（與 push 一致） | ready 尾 `…8101,**7112**`；slots `0:8101` `1:7112` | **A** |

**7112 從哪來：** prep seed 至 7111 後欄位自動 **7112** + ready seed 步驟透過 `allocateOrderNumber()` 取號 → **測試／harness 送錯 ready**，非未送票憑空出現。

**共用 store / 其他 CI：** `cross-zone-leak-diagnose` 與 `ci.yml` **`e2e-live-cloud` 同 group `live-cloud-zz-qa-ci-store`**。07:02:48 **僅** cross-zone job [38182681355] 在跑；38182993862 窗內無第二 writer（e2e **07:16:59** 才開）。後端無法區分 job 名，但 **GHA 時間可排除並行 e2e**。詳見 `hypothesis0-ci-overlap.md`、`hypothesis0-backend-correlation.md`。

**Hypothesis 0-other-writer：** 對 **07:02:48 / 38182993862 leak 根因** → **否**；7112 已由 **本 repo cross-zone harness** 解釋。

---

## 是否仍有「cross-zone 混區」產品 bug？

**就 7112 事件：沒有。** 號碼在雲端即為 ready，看板只是正確顯示錯資料（測試送錯）。  

**#53 時代 QA 的 page-turn／動畫 mid-apply 問題** 仍是**另一條產品線**（時序／indicator），與「prep 號被雲端標成 ready」無關；revert #53 後 cross-zone RED 仍可來自 **harness 再次送 7112→ready**，不證明 board 會在 **正確 doc** 下把 prep 畫到 ready。

---

# Cross-zone 滲漏診斷（prep 7112 出現在 ready 區）

## 真雲 RED 已實跑

| 項目 | 結果 |
|------|------|
| GHA | https://github.com/UltronService/milksha-demo/actions/runs/38182993862 |
| Store | `zz-qa-ci-store` |
| 腳本 | `run-real-cloud-cross-zone-red.mjs` → exit **1**（資料錯，非 board 亂畫） |
| 後端 | 07:02:48 台北 `push_numbers` **ready=[7112]**（proven） |

---

## 假設（排序）

0. **（proven A）Harness/controller seed 將 7112 以 ready 推送** — 後端 seq 12525；修正 seed／assert push。  
0b. ~~B 雲端 mislabel~~ — **已否決**（雲端=controller）。  
0c. ~~C board partition  alone~~ — **否決**（需 doc prep + snap ready 分裂；此处 doc=ready）。  
1. **Page-turn / layer-float 使 QA 更難看** — 加重可見度，非 7112 進 ready 根因。  
2. **#53 page-turn desync** — 獨立議題；非本 leak 根因。  

---

## 修復測試邊界（harness／CI，非產品）

1. Seed 後 **assert 每筆 `push_numbers`**：`ready` 不得含 `/^7/`（除非明確 one-ready 步驟）。  
2. Prep 7111 後 **強制 `fill(8100)` 並 assert `#fld-no`/`getTickets()`** 再送 ready。  
3. 真雲 RED：**先驗 push 與 readBoard 一致**，再驗 board slot；預期 ready 8100–8111，**不得** 7112。  
4. 30–45 輪 mid prep 7200+c：cross-zone **7xxx in ready slot** = fail。  
5. 與 `live-cloud-zz-qa-ci-store` 排隊一致；重疊窗寫入 `hypothesis0-ci-overlap.md`。  

---

## 產物

- `hypothesis0-backend-correlation.md`、`hypothesis0-ci-overlap.md`  
- `cross-zone-hypothesis0-capture.yml`（apply `number`+`source_type`、readBoard）  
- `run-real-cloud-cross-zone-red.mjs`、`real-cloud-red-failing-frames.json`  
