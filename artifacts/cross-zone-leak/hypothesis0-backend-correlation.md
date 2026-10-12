# Backend logs × GHA 對時（zz-qa-ci-store / stb-01）

後端唯讀 log（PM 提供）摘要：

| 台北時間 | 事件 | ready | preparing |
| --- | --- | --- | --- |
| **07:02:48.096** | push_numbers seq 前 | （空） | 7100–7111 |
| **07:02:48.627** | push_numbers **seq 12525** | **[7112]** | 7100–7111 |
| （後續） | 下一筆寫入 | 含 **8101** 等 | … |
| **07:05:07** | clear（推定 teardown） | — | — |
| **07:16:51** | clear（推定 teardown） | — | — |

## 對應 GHA job（UTC → 台北 +8）

| Run | 台北時段 | 結論 | 與 07:02:48 關係 |
| --- | --- | --- | --- |
| [38182681355](https://github.com/UltronService/milksha-demo/actions/runs/38182681355) | **07:01:08 – 07:05:15** | assert 失敗（RED 腳本 exit 0） | **07:02:48 落在本 run seed 階段**（12 prep 後第一筆 ready 誤送 7112） |
| [38182993862](https://github.com/UltronService/milksha-demo/actions/runs/38182993862) | **07:06:22 – 07:16:57** | RED exit 1（7112 leak） | 07:06 起 `clear_now` 後 **同一 seed 腳本** 極可能再次寫入 7112；07:16:51 clear 對應本 run 結束 |
| [38182998228](https://github.com/UltronService/milksha-demo/actions/runs/38182998228) e2e-live-cloud | **07:16:59** 起 | 排隊於 RED 結束後 | **不**覆蓋 07:02:48 |

## 機制（測試 bug A，與後端一致）

1. 腳本 seed 12 筆 prep `7100–7111`（`run-real-cloud-cross-zone-red.mjs` + `fireTicket`）。
2. 最後一筆 prep **7111** 成功後，controller `bumpNumberFieldAfterSend` 將 `#fld-no` 设为 **7112**（`controller/controller-app.js`）。
3. ready seed 第一筆應送 **8100**，但 `btn-add-ticket` 以 **`allocateOrderNumber()` 讀當下欄位**（同檔 ~1870）；若與 Playwright `fill(8100)` 競態或欄位仍為 7112，則 `ticketsToPushParams()` → **`push_numbers` ready=[7112]**（後端已證）。
4. 雲端如實寫入；看板 `applyPayload` 依 `From_Store_OK` 進 `readyItems` — **非 board 錯分**。

POS 無、無第二 device、138 pushes 全 200、無 409 → **排除 B（雲端擅自改 label）**。
