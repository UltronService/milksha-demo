# Board background self-QA (1007)

- **HEAD:** `429b28985e266f1a62654628417c098f45c9854d`
- **Base (`origin/main`):** `6ef1359cea99cccb5dda74afeed7003888518515`
- **PR:** [#33](https://github.com/UltronService/milksha-demo/pull/33)，`base=main`
- **mergeable_state:** `MERGEABLE` / `mergeStateStatus: CLEAN`（2026-10-08 推送後查詢）

## 變更摘要

1. 橫向畫布全幅 `assets/milksha-board-bg-1007.jpg`，隨 #25 canvas `scale()` 縮放。
2. 號碼 `Arial, Arimo, sans-serif`；cream／區塊透明疊在底圖上。
3. **留邊：** 非 16:9 時 `.milksha-stage` 背景 **#000000**（僅畫布外）。
4. 未修改 `js/receiver/cloud-runtime.js`。

## 自測

| 項目 | 結果 |
|------|------|
| `npm test` | **141 / 141** pass |
| `npm run test:e2e`（全量） | **123** pass，**4** skipped，**1** fail 本機 `guest-clock` Roboto／DejaVu 環境差（與底圖無關；CI 見下方） |
| `node scripts/board-background-self-qa.mjs` | **10** 張（8 情境 + 2 留邊） |

### CI

- Run: https://github.com/UltronService/milksha-demo/actions/runs/37813640924（推送 `be42b97` 後；完成狀態見 GitHub Checks）

## 截圖

`artifacts/board-background-self-qa/screenshots/`

| 情境 | 1920 | 3840 |
|------|------|------|
| 0 / 3 / 10 / 11+ | `board-*-1920.png` | `board-*-3840.png` |

- **留邊黑色：** `letterbox-1440x1080.png`、`letterbox-1920x800.png`
- **比對：** `compare-full-10-vs-ref-1920.png`
- 1920×1080、3840×2160 全螢幕無留邊（canvas 貼滿視窗）

## E2E 相關

- `home-board-canvas-scale.spec.mjs`：留邊尺寸 + `getComputedStyle(.milksha-stage).backgroundColor === rgb(0, 0, 0)`（1440×1080、1920×800）

## 與參考圖差異

標題在底圖；DOM 標題隱藏。無 Arial 時字型略異。翻頁指示器參考圖未含。

## UAT

1. 新底圖。2. 格位／翻頁。3. 4:3 或扁屏外圍黑邊。4. 全螢幕 16:9 無黑邊。
