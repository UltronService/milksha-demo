# Board motion 7 — 假設（REPRO 階段，未改產品碼）

對照店長 2026-10-11 12:32 `c030020` 錄影與 contact sheet。動畫參數固定：fade/slide 0.3s、ready 1.3× hold 3s、翻頁 ~0.5s。

---

## 1. 分頁指示 1/2、2/2 位置錯誤

**渲染位置（已確認）**  
- DOM：`.milksha-pg-indicator`（橫式 art 另加 `--art`），由 `updateZonePageIndicator()`（`js/milksha-board.js`）在 `commitBoardView()` 增量更新時 `zone.appendChild`；首次 `renderZoneHtmlArt()` 則用 cream 內联 `left/top`。  
- CSS：`.milksha-pg-indicator--art` 設 `right/bottom: auto`（`css/milksha-board.css`），**若增量路徑未寫入 inline 座標，會落在 zone 左上角 (0,0)**，即畫面「準備中」標題左外側小字。  
- **目標位置（後續 UI，非本 PR）**：各區 cream 框內右下，1920×1080 距右/下 16px、28px 字、`rgba(34,34,34,0.55)`，單頁隱藏。

| 排序 | 假設 | 驗證方式 |
|------|------|----------|
| 1 | 增量更新走 `updateZonePageIndicator()`，art 模式只加 class 未算 cream 右下座標 | 紅測：`item 1` 量測 indicator 是否在 cream 內且近右下 16px |
| 2 | `patchZonePage()` 動畫路徑不更新 indicator，與 `renderBoard()` 首次位置不一致 | 翻頁後比對 indicator 父層與 `data-started-at` / inline style 有無 |
| 3 | indicator 掛在 `.milksha-zone` 而非 cream 子層，非 art 的 `right:14px` 相對整區而非奶黃框 | 比對 `measurePageIndicatorInCream` 與 `LandscapeArtLayout.creamRectForZone` |

---

## 2. 離場號碼未在原地淡出（邊 fade 邊位移、與他號重疊）

| 排序 | 假設 | 驗證方式 |
|------|------|----------|
| 1 | `scheduleChipFadeOutRemove()` 雖 `detachChipFromSlotForFade()` 固定座標，但同 id 仍進 `diff.moved` 觸發 `animateTranslate()`，fade 與 FLIP 並行 | 紅測 `item 2`：離場 chip 在 opacity&lt;0.95 期間 `getBoundingClientRect` 漂移 &lt;3px |
| 2 | 離場 chip 為 `--layer-float` 時，其他 slot 的 FLIP 路徑穿過其視覺區 | 紅測 `item 3` 採樣 `findOverlappingChipPairs` |
| 3 | `movedIdSet` 跳過 reconcile 清 slot，但 removed 與 moved 同一 tick 競態 | unit：對 `syncZone` 同時 removed+moved 記錄 `animateTranslate` 呼叫次數 |

**與 #46**：會觸及 `syncZone` / `animateTranslate` / fade detach，**建議 #46 合併後再改離場邏輯，或基於 #46 分支疊 patch**。

---

## 3. 請取餐右欄→左欄補位對角線「飛過」其他號碼

| 排序 | 假設 | 驗證方式 |
|------|------|----------|
| 1 | 補位被算成 slot `from→to` 單段 `animateTranslate(dx,dy)`，跨欄時 dx、dy 同時大 | 紅測 `item 3`：更新後 420ms 內不得有 chip 對 overlap |
| 2 | grid 0–4 左欄、5–9 右欄，序號 snake 與 slot index 變更被當成「同一 chip 移動」 | 對 `diffVisibleSlots` + `layoutPageGrid` 列印 from/to slot 是否跨欄 |
| 3 | 離場 fade float 未收完就 FLIP 其他 chip | 採樣 `detachedCount` 與 overlap 相關係數 |

**與 #46**：**高度重疊**（#46 正是跨欄 move 動畫）。**應在 #46 上驗證 item 3；main 上紅測預期仍失敗**。

---

## 4. 左欄→右欄對角線（2101、2114）

**範圍在 open PR #46**（`cursor/column-move-animation-a2ca`），本分支不修。假設同 item 3 的 `animateTranslate` 單段 FLIP，#46 擬改為分軸或 fade-replace。

---

## 5. 第 2 頁→第 1 頁：無 fade-in、號碼對角聚集

| 排序 | 假設 | 驗證方式 |
|------|------|----------|
| 1 | 頁數由 2→1 時走 `pageTurn` + 同時 `diff.moved` 非 pageTurn 路徑混用，chip 帶 FLIP 進場 | 紅測 `item 5`：`seenDiagonal` 為 false、`seenLow` 為 true |
| 2 | `pageTurn` 中 `snapOpacity(numbersLayer,0)` 後第二段 fade-in 未跑完（generation 取消） | 檢查 `data-page-turn-anim` 與 layer opacity 是否卡 0（連 item 6） |
| 3 | `interruptedPageTurn` → `hardRebuildSlotsFromCells` 跳過 layer fade | 在 shrink 時打 `getGeneration()` 與 `abortPageTurnLayerState` 日誌 |

**與 #46**：**部分重疊**（都在 `syncZone` / pageTurn）。**順序：先 #46 合併，再修 pageTurn + shrink 互斥**。

---

## 6. 第 2 頁唯一號碼移除後，空第 2 頁停留 ~1s

| 排序 | 假設 | 驗證方式 |
|------|------|----------|
| 1 | 在 page 2 顯示時縮減為 10 筆，`pageTurn` layer opacity 卡 0，`commitBoardView` 未把 prep 內容恢復到可見 | 紅測 `item 6`：1.1s 後 layerO&gt;0.85 且 visible chips&gt;0 |
| 2 | `prepPage` 已 clamp 到 0，但 `lastRenderedPrepPage` 與 timer 仍指向空 page index 直到下一個 `PAGE_INTERVAL_MS` | 在 shrink 後讀 runtime 內部 page（若加 test hook） |
| 3 | `patchZonePage()` 與 `commitBoardView()` 雙路徑競態，indicator 已單頁但 layer 仍 fade-out 中 | 對照 indicator 文字與 layer opacity 時間軸 |

**與 #46**：**低～中**（pageTurn 共用 `syncZone`）。**建議 #46 後處理 layer 卡住**。

---

## 7. 第 1 頁→第 2 頁：第 1 頁有淡出，第 2 頁號碼無 fade-in 直現

| 排序 | 假設 | 驗證方式 |
|------|------|----------|
| 1 | `pageTurn` 第二半段 `runOpacityAnim(numbersLayer,0,1)` 與新建 chip（預設 opacity 1）疊加，視覺為「pop」 | 紅測 `item 7`：`sawPopIn` 為 false（page2 chip 出現時 layerO≥0.98） |
| 2 | chip 應在 layer fade-in 間設 opacity 0 或個別 fade，目前僅 layer 動 | 翻頁 mid 幀檢查 chip 與 layer 合成 opacity |
| 3 | WAAPI `fill:forwards` 在 headless 與 STB 行為差異 | STB/Chromium 对比同一測試 |

**與 #46**：**低**（pageTurn 區塊）。可與 item 5/6 一併修 `syncZone` pageTurn。

---

## 8. UI _review：2113/2119 重疊、準備中 2117 ghost 覆蓋 2116

| 排序 | 假設 | 驗證方式 |
|------|------|----------|
| 1 | **主因同 item 2/3**：FLIP 中途 + `--layer-float` 淡出，兩枚 chip 短時 bbox 重疊，非 #39 雙 chip 卡同一 cell | contact sheet 時序 + 紅測 item 3；**靜止後** `getBoardIntegritySnapshot`（item 8）應無 `cell-chip-count` |
| 2 | **次要**：#39 類 slot 替換時兩 chip 同 cell 未 evict（已修復 regression 在 `board-cell-integrity.test.js`） | 若 item 8 靜止仍 overlap → 查 `evictDuplicateItemIdChips` |
| 3 | ghost 2117 為 page 翻頁 layer 半透 + 舊 chip 未 remove | 靜止後 DOM 是否仍存 `data-item-id` 含 2117 |

**紅測策略**  
- **靜止態 orphan 雙 chip**：`item 8` e2e（多步 churn 後 assert 無 violation、無 bbox overlap）— **在 main 上目前為綠**，支持假設 1（場景問題在動態）。  
- **不另開與 item 3 重複的 mid-flight 紅測**；若靜止失敗再升格為 #39 類回歸。

---

## PR #46 衝突摘要（items 2、3、5）

| Item | 與 #46 共用程式 | 建議順序 |
|------|-----------------|----------|
| 2 | `syncZone`、`scheduleChipFadeOutRemove`、`animateTranslate` | **#46 合併後**再改 removed vs moved 互斥 |
| 3 | `animateTranslate` / FLIP、`diff.moved` | **在 #46 分支上修**；main 紅測保留作回歸 |
| 5 | `syncZone` pageTurn + moved 混線 | **#46 合併後**再拆 pageTurn 與 FLIP |

#46 文件（`artifacts/board-concat-bug/ROOT-CAUSE.md`）已註明 column move 與 detach/evict **正交**；item 3/4 的 FLIP 軌跡仍會動同一函式。

---

## 紅測指令

```bash
npm ci
npx playwright install chromium
npx playwright test tests/e2e/board-motion-7-diagnose.spec.mjs --reporter=line
```

預期 main（2026-10-11 實測）：**item 1、2、3、5、6、7 失敗**；**item 8 通過**（靜止無 orphan overlap，支持「2113/2119、2117 ghost 主因為動態 FLIP/float」）。
