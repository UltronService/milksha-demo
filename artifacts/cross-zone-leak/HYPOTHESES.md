# Cross-zone 滲漏診斷（prep 號如 7112 出現在 ready 區）

**基底：** `cursor/cross-zone-leak-diagnose` 自 **revert PR #53 後** 的程式（等同 #53 前 board 邏輯 + asset `20261011d`）；證據來自 `zz-qa-ci-store` 30 輪 run（commit **4146812** site，`artifacts/pr53-live/real-cloud-4146812-1080.json`）。

## 最小重現序列（已縮到）

1. Seed **12 prep**（7100–7111）+ **12 ready**（8100–8111）真雲 devCommand。
2. 等 **5200ms**（6s 換頁窗內，對齊 QA）。
3. 翻頁進行中再送 **prep 7200+c**。
4. 在 **800ms @ 50ms** + **13×500ms** 採樣內，ready **indicator 2/2**、opacity≥0.99 時，ready **slot** 出現 `{8101, 7112}`。

**進行中動畫：** ready 區 **page-turn**（`data-page-turn-anim` + numbers layer opacity 0→1）；同時 prep 有 mid-send 觸發 **多次 applyPayload**（round0 平均 **~26 board_snapshot** / 單次 mid-send 窗口）。**非** column-move 主路徑；7112 為 prep 第 13 筆，非 ready snapshot 成員。

## RED 測試

| 類型 | 指令 / Workflow | 預期 |
|------|-----------------|------|
| 真雲 | `node artifacts/cross-zone-leak/run-real-cloud-cross-zone-red.mjs` 或 `cross-zone-leak-diagnose.yml` | **exit 1** 當任一 frame 的 slot/loose 號碼 ∉ 該區 `getSnapshot()` |
| 離線 | `node artifacts/cross-zone-leak/run-offline-replay-red.mjs` | 以 30 輪紀錄的 **apply 次數 burst** 重播；fake-cloud **通常 exit 0**（無法穩定 RED）→ 缺口在 **真雲多 snapshot 時序** |

## 假設（排序）

1. **Page-turn 中點 slot 清空後、fade-in 前，另一 zone 的 chip 被錯挂到 ready cell（或 float clone 未清除）** — 驗證：在 `milksha-board-anim.js` `pageTurn` 分支 midpoint 前後 dump `data-item-id` 與 zone root；預測：7112 的 chip 父節點曾為 `.milksha-zone.ready`。  
2. **`commitBoardView` / `cancelAll` 在連續 apply 時中斷 WAAPI，DOM 留舊 prep 字串於 ready slot** — 驗證：hook `applyPayload` 計數>1 的幀對照 `domVisibleLayoutMatches`；預測：leak 幀 apply 次數≥2。  
3. **`.milksha-num` loose 查詢把 **layer-float** 或上一頁 DOM 算入 ready（7112 僅在 loose 全集合）但 slot 亦中** — 驗證：比對 slot-only vs loose；預測：slot 仍含 7112 → 非純評分假陽性。  
4. **Ready ring 翻到 page 2 時 prep 7112 因 item-id 碰撞被寫入 ready grid** — 驗證：比對 `getSnapshot().preparing` 與 ready slot `data-item-id`；預測：7112 id 來自 prep 列表。  
5. **4K 較易 leak 因 pageDuration 相同但 layout scale 改變 float 定位** — 驗證：同序列 4K vs 1080 cross-zone 輪數；預測：4K cross-zone 輪數更高（30 輪已見 4→14）。  

## 建議修復測試邊界（3–5 項）

1. 真雲 `zz-qa-ci-store`：10+ 輪 page-turn + mid prep，**零** cross-zone（snapshot 集合 vs 各 zone slot）。  
2. 1080 + 4K：ready page 2 僅 `{8101,8100}` slot，不得出現任何 `7xxx`。  
3. 單輪 mid-send 後 **3s 內** prep 7200 必須出現在 prep zone。  
4. Page-turn 中連續 **5 次** applyPayload（模擬 snapshot 風暴）後 slot 仍與 snapshot 一致。  
5. 動畫結束後 **layer-float** 計數為 0，且無 orphan `.milksha-num` 跨 zone。  

## 產物

- `cross-zone-assert.mjs` — 判定邏輯  
- `run-real-cloud-cross-zone-red.mjs` — 真雲 RED  
- `run-offline-replay-red.mjs` — burst 離線重播  
- `real-cloud-red-result.json` — CI 輸出  
