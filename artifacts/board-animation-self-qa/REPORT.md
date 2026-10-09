# 看板叫號動態自測報告

- **HEAD**: `5a7ed9b`
- **PR**: https://github.com/UltronService/milksha-demo/pull/35
- **CI**: https://github.com/UltronService/milksha-demo/actions/runs/37895148471 （success）

## 規格 1–7 實作摘要

| # | 行為 | 實作 |
|---|------|------|
| 1 | 新單進準備中 | 新 chip 立即進 DOM，`opacity` 0→1（300ms）；既有號 FLIP/位移 300ms |
| 2 | 準備中→請取餐 | 準備中淡出；請取餐淡入 + 綠底偽元素 3s 後 0.3s 淡回 |
| 3 | 取餐消失 | 請取餐淡出 300ms + 補位 |
| 4 | 換頁（>10） | `data-page-turn-anim` 區層 cross-fade 500ms |
| 5 | 清空 | 全 chip 淡出 300ms |
| 6 | 不做動態 | `first-payload`、`silent-reconnect`、`prefers-reduced-motion`、無 WAAPI、`bulk-snapshot-combined` |
| 7 | 比對名單 | `diffVisibleSlots` + FLIP（`js/board/milksha-board-anim.js`） |

## 不做動態判斷規則

1. 看板 boot 後第一次 `applyPayload`（`first-payload`）
2. `applyPayload(..., { silent: true })`（重連 snapshot）
3. `prefers-reduced-motion: reduce`
4. 無 `Element.prototype.animate`
5. 合併準備中+請取餐名單交集比例 &lt; 35% 且合計 ≥ 6 筆（`bulk-snapshot-combined`）

## 請取餐 3 秒標示（UI 定案）

- 綠底：`--milksha-ready-highlight: var(--milksha-prep-bg)`（`#88a040`）
- 字色 `#222222`；`::before` 圓角 4px、em 留白不撐開格子
- 3s 後 `.milksha-board-chip--unhighlighting` 偽元素 opacity 0.3s 淡回

## 自動化測試

| 項目 | 結果 | 證據 |
|------|------|------|
| `npm test` | 166 passed | 本機執行 |
| e2e 規格 1–7 | `tests/e2e/board-animation.spec.mjs` | 含 reduced-motion、無 WAAPI、背景分頁、快速連續更新 |
| 請取餐標示 | `tests/e2e/board-animation-highlight.spec.mjs` | `screenshots/ready-highlight-active-1920.png`、`ready-highlight-faded-1920.png` |
| 真雲端 zz-qa-store-a | `tests/e2e/board-animation-live-cloud.spec.mjs`（branch site route + 雲端 API） | 中位 &lt; 3s；單次最大 &lt; 5s（高負載容錯） |

## 解析度證據

| 解析度 | 50ms 連續截圖（規格 1–6 情境） | 4× CPU trace |
|--------|-------------------------------|--------------|
| 1920×1080 | `artifacts/board-animation-self-qa/burst/1920x1080/`（86 frames） | `artifacts/board-animation-self-qa/perf/trace-1920x1080-cpu4x.zip` |
| 3840×2160 | `artifacts/board-animation-self-qa/burst/3840x2160/`（89 frames） | `artifacts/board-animation-self-qa/perf/trace-3840x2160-cpu4x.zip` |

效能：`performance.getEntriesByType('measure')` 在 trace 腳本中為空；請以 Playwright trace zip 檢視長任務與掉幀。

## 送號→顯示（假雲端 zz-qa-store-a，10 次）

見 `artifacts/board-animation-self-qa/metrics.json`：

| 版本 | 中位 (ms) | 最大 (ms) |
|------|-----------|-----------|
| 分支 | 500 | 501 |
| main | 500 | 4962（首輪冷啟動 outlier；其餘 &lt; 502） |

## 手動 UAT 速查

1. 開本機看板 `?mode=local`，送準備中號 → 0.3s 內淡入、不跳格
2. 同號改請取餐 → 左區消失、右區綠底 3s 後淡回奶油白
3. 取餐刪號 → 淡出補位
4. 準備中 &gt;10 號等換頁 → 0.5s 交叉淡入淡出
5. 清空 → 全淡出
6. 重連 silent 整份重送 → 無動畫
7. 系統開「減少動態」→ 無動畫
