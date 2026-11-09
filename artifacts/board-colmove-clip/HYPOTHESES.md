# 欄位搬移（column-move）奶油框裁切 + 重疊 — 假設排序

**症狀（owner 影片 c030020 / d32）：**
- @00:32：左欄底推到右欄頂時，chip 從奶油框上方標題區滑入，遮住「準備中」。
- 同段：新號碼（如 0034）淡入時與正往下滑的 0030 外框重疊。

**main 實測 SHA：** 見 PR 分支最新 commit（Playwright 本地 fake cloud，`/?mode=local`，landscape art grid）。

| 排序 | 假設（一句） | 如何驗證（一句） | 預測 |
|------|----------------|------------------|------|
| 1 | `animateColumnMoveEnterFromAbove`（`js/board/milksha-board-anim.js`）以 `-pitch` 起點平移，右欄頂格再往上必進標題帶。 | `board-colmove-clip.spec.mjs` rAF 量 pushed chip vs art/DOM cream + title guard。 | **RED**：`title-overlap` / `outside-cream`（1080p prep 實測 pushed `store:8700` 等）。 |
| 2 | `.milksha-num-cell` / grid 無 `overflow:hidden`，transform 可畫在 cell 外（`css/milksha-board.css`）。 | 同 e2e `outside-cream`。 | 與 #1 並存；只加 clip 可能仍要改起點。 |
| 3 | 浮層 `milksha-board-chip--layer-float` 掛在 `.milksha-zone-numbers`（`detachChipFromSlotForFade`），**未**以 cream 為裁切根，z-index:4 可蓋標題。 | 取樣含 exit clone；ready 實測 `chip-overlap` 含 clone。 | exit clone 與 in-cell chip 可互叠。 |
| 4 | `estimateRowPitchPx` 偏大 → enter-from-above 起點過高。 | 比對 violation chip.top 與 cream.top（4K 曾見 top 負值）。 | pitch 一整列時頂格必穿框。 |
| 5 | **(a)  overlay 未裁到 cream：** art 模式無 `.milksha-cream` DOM，動畫若只信 cell 座標會以全 zone 為畫布。 | e2e 用 `LandscapeArtLayout.creamRectForZone` 對 client rect。 | 無 cream DOM 時仍可在 title guard 區看到 chip。 |
| 6 | **(b) 新號 fade 與 FLIP 同幀：** 第 6 筆進 slot0 的 `runOpacityAnim` 與舊 slot0 的 `animateTranslate` 並行，新 chip opacity>0 時舊 chip 尚未離開 cell。 | rAF 斷言 `cell-double-occupy` / `chip-overlap`（0034/0030 同型：`8401` vs 新 `8406`）。 | **RED**：1080p prep 實測 `cell-double-occupy` 28 次／輪、`chip-overlap` 10+。 |
| 7 | **(b) 時序：** `afterLayout` 內 skip-FLIP 路徑對 moved chip 先 `snapOpacity(0)` 再 translate，但 **added** 新號在 slot 內直接 opacity 動畫，未延後到舊 occupant 清空。 | 查 `createBoardAnimator` reconcile �圈 vs `columnMoveEnterFromAboveIds` 分支順序。 | 同格雙 occupant 與外框相交。 |
| 8 | ready 1.3× pulse 放大 chip 矩形，加劇 overlap（`animateReadyPulse` on `addedId`）。 | ready 欄 4.2s 取樣仍見 `chip-overlap`。 | pulse 期 overlap 持續（main fail）。 |

## QA 驗收清單 A 段（`board-animation-acceptance.md`）對 main 結果

容許值 **0**；場景：5→6 column-move；取樣：rAF（約 16ms，細於 0.05s）。記錄：`artifacts/board-colmove-clip/ACCEPTANCE-MAIN.json`。

| 項目 | 內容 | main |
|------|------|------|
| A.1 | 整段動態密取樣，非只結束畫面 | **FAIL**（有 mid-motion violations，但 ready 取樣幀數偏多含 settle 後段） |
| A.2a | 不可超出白框（cream） | **FAIL**（prep 1080p：`outside-cream`×13；4K prep×22） |
| A.2b | 不可蓋標題 | **FAIL**（prep 1080p：`title-overlap`×13） |
| A.2c | 號碼不可互穿／外框相交 | **FAIL**（`chip-overlap` 10–16／輪） |
| A.2d | 不可斜移 | **FAIL**（prep 1080p/4K：`diagonal-move`×1；ready 4K 未計對角或 pulse 為主） |
| A.3 | 容許值 0 | **FAIL**（同上） |
| A.4 | 1080p + 4K；ready 含 1.3× | **FAIL**（四組 prep/ready×viewport 皆 fail） |
| A.5 | 60fps 影片人工複驗 | **未測**（需 QA 錄影；e2e 不取代） |

## B 段（既有）

| 項目 | main（本 PR 範圍） |
|------|---------------------|
| B.1–B.3 | 未在本診斷 e2e 重跑（既有 `board-column-move` / integrity 規格另列） |
| B.4–B.6 | 手動／環境限制，未測 |

## 與 PR #52（`cursor/board-motion-items-2-3-a2ca`）

- 同改 `milksha-board-anim.js` column/backfill；#52 **未修** `animateColumnMoveEnterFromAbove`。
- #52 新增 `animateColumnMoveEnterFromBelow`：**對稱風險**為左欄底進場時 chip 矩形可能穿出 cream **下緣**（本 e2e 已含 `below-cream` 檢查）。
- #52 backfill 若仍與新號 fade 並行，**cell-double-occupy** 可能與 d32 0034/0030 同根因。

## 最小 RED 案例

- prep、1920×1080、5→6；pushed chip + 新舊 top-left 同時取樣 → `board-colmove-clip.spec.mjs` 第一則 + `d32 overlap red` + `timing red`。

## 建議修復驗收邊界

見 `TEST-BOUNDARY.md`（10 條）。
