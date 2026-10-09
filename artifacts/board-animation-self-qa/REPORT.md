# 看板叫號動態自測報告（進行中）

## UI 定案：請取餐 3 秒標示

| 項目 | 實作 |
|------|------|
| 標示方式 | 號碼格綠底（`::before`），字色不變、無外框 |
| 綠色 | `--milksha-ready-highlight: var(--milksha-prep-bg)` → `#88a040` |
| 字色 | `#222222`（`--milksha-num-color`） |
| 一般底 | 奶油白 `#fffbe6`（區域 cream／底圖） |
| 圓角／留白 | `border-radius: 4px`；`::before` 以 `-0.25em`／`-0.1em` 延伸，不增加 chip 版面尺寸 |
| 淡回 | 標示 3s 後加 `.milksha-board-chip--unhighlighting`，偽元素 `opacity` 0.3s 淡回 |
| 解析度 | em 相對字級，1920／4K 同比例 |

## 不做動態的判斷規則（已實作）

1. `isFirstPayload`：看板 boot 後第一次 `applyPayload`
2. `opts.silent === true`：斷線重連／整份 snapshot（cloud-runtime 既有行為）
3. `prefers-reduced-motion: reduce`
4. 無 `Element.prototype.animate`（舊瀏覽器）
5. `isBulkSnapshotReplace`：兩區大量換血（交集比例 &lt; 35% 且合計 ≥ 6 筆）

## 變更檔案

- `js/board/milksha-board-anim.js`（名單 diff、FLIP／opacity、請取餐標示排程）
- `js/milksha-board.js`（chip DOM、`commitBoardView`）
- `css/milksha-board.css`（highlight 偽元素）
- `index.html`（載入 anim 腳本、cache bust）

## 自測狀態

- [x] `npm test`（166 passed，HEAD 待最終 push 後更新 SHA）
- [x] e2e：`board-animation-highlight.spec.mjs`（標示中／淡回後截圖）
- [ ] 完整 e2e 1–7、4K 錄影、效能 trace、真雲端 zz-qa-store-a（待續）

## 截圖

- `artifacts/board-animation-self-qa/screenshots/ready-highlight-active-1920.png`
- `artifacts/board-animation-self-qa/screenshots/ready-highlight-faded-1920.png`
