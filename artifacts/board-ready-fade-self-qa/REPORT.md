# 請取餐放大淡入（scale pulse）自測報告

- **HEAD**: （見本分支最新 commit `git rev-parse HEAD`）
- **PR**: https://github.com/UltronService/milksha-demo/pull/36
- **CI**: （見 PR #36 最新 Actions run，需 success）
- **Base**: `c601df6`

## 規格（迷客夏 21:51）

1. 新號進請取餐：**opacity 淡入 + `transform: scale` 至約 1.3×**（~0.3s ease-out），**停留 3s**，再 ~0.3s 縮回 1×。無亮色、僅 opacity + scale。
2. 多張同時叫號一起 pulse；**first / silent / force / reduced-motion / 無 WAAPI** 不放大。換頁、清空、取餐、連續更新會 `cancelAll` 中斷；背景分頁回前景重置 transform（既有 `visibilitychange`）。
3. 放大不超出請取餐區、不蓋鄰格：`milksha-board-anim-config.js` 依格線與 chip 量測 **safeMax**，實際 `effective = min(readyScale, safeMax)`。滿格 4 位數時 **1.3 會重疊**，本機量測（10 格 `999x`）約 **1080 safeMax≈1.05、4K safeMax≈1.05**（見 `metrics.json`），故實際 pulse 約 **1.05×** 而非 1.3。e2e：`board-ready-scale-bounds.spec.mjs`。
4. 設定集中於 `js/board/milksha-board-anim-config.js`，URL 覆蓋見下表。
5. **動態預覽頁**：未實作（估計獨立 preview 頁 + 假資料驅動 + 表單約 **3–4h**；本輪優先動畫與 QA）。

## URL / 設定參數

| 參數 | 對應欄位 | 預設 | 合法範圍 | 說明 |
|------|-----------|------|----------|------|
| `animOpacityIn` | opacityInMs | 300 | 50–2000 ms | 準備中／一般淡入 |
| `animPage` | pageDurationMs | 500 | 100–3000 ms | 換頁 cross-fade |
| `animScale` | readyScale | 1.3 | 1–1.5 | 請取餐 pulse 峰值倍率 |
| `animIn` | readyScaleInMs | 300 | 50–2000 | 進入放大＋淡入；**&lt;60 視為秒**（如 0.3→300ms） |
| `animHold` | readyScaleHoldMs | 3000 | 0–10000 | 停留；**&lt;60 視為秒**（如 2→2000ms） |
| `animOut` | readyScaleOutMs | 300 | 50–2000 | 縮回；**&lt;60 視為秒** |

## 自動化

| 項目 | 結果 |
|------|------|
| `npm test` | 169 passed |
| `npx playwright test board-animation board-ready-scale` | 15 passed |
| `npm run test:e2e` 全量 | 見 `e2e-full.log`（執行中或本機摘要） |

## 真雲端 zz-qa-store-a（3 次 ms）

**25, 932, 833**（`live-cloud-samples.json`）。

## 效能（4× CPU，ready pulse 情境）

| 解析度 | avg fps | >50ms 幀 | longtask | effective scale |
|--------|---------|----------|----------|-----------------|
| 1920×1080 | 60.2 | 0 | 0 | 1.048 |
| 3840×2160 | 60.0 | 0 | 0 | 1.048 |

來源：`metrics.json` → `perfReadyPulseCpu4x`。

## Contact sheet

- `contact-sheets/1920x1080-ready-fade-in.jpg`
- `contact-sheets/3840x2160-ready-fade-in.jpg`  
  prep→ready pulse 連續幀（`scripts/board-ready-fade-contact-sheet.mjs`）。

## 變更檔案（看板）

- `js/board/milksha-board-anim-config.js`（新）
- `js/board/milksha-board-anim.js`
- `js/milksha-board.js`
- `css/milksha-board.css`
- `index.html`
- `tests/e2e/board-animation*.spec.mjs`, `board-ready-scale-bounds.spec.mjs`
