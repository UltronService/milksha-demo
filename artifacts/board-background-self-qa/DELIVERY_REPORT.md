# Board background self-QA (1007)

- **HEAD:** `5c9f62c`（含留邊黑色）
- **Base (`origin/main`):** `6ef1359`（#25 已合併）
- **PR:** #33，`base=main`，diff 僅底圖／留邊／自測（不含 #25 commits）
- **對齊:** `git rebase --onto origin/main 5d9e6ac`

## 變更摘要

1. 橫向畫布全幅 `assets/milksha-board-bg-1007.jpg`，隨 #25 canvas `scale()` 縮放。
2. 號碼 `Arial, Arimo, sans-serif`；cream／區塊透明疊在底圖上。
3. **留邊：** 非 16:9 時 `.milksha-stage` 背景 **#000000**（僅畫布外；畫布內底圖與號碼不變）。
4. 未修改 `js/receiver/cloud-runtime.js`。

## 自測

| 項目 | 結果 |
|------|------|
| `npm test` | 141 / 141 pass |
| `node scripts/board-background-self-qa.mjs` | 10 張截圖（含留邊 2 張） |
| `npm run test:e2e` | 見 CI／下方更新 |

## 截圖路徑

`artifacts/board-background-self-qa/screenshots/`

| 情境 | 1920 | 3840 |
|------|------|------|
| 0 筆 | `board-empty-0-1920.png` | `board-empty-0-3840.png` |
| 3 筆 | `board-three-3-1920.png` | `board-three-3-3840.png` |
| 10 筆 | `board-full-10-1920.png` | `board-full-10-3840.png` |
| 11+ 筆 | `board-page2-11-1920.png` | `board-page2-11-3840.png` |

**留邊（黑色）：** `letterbox-1440x1080.png`、`letterbox-1920x800.png`  
**比對：** `compare-full-10-vs-ref-1920.png`

1920×1080、3840×2160 全螢幕截圖應無上下／左右黑邊（canvas 貼滿視窗）。

## E2E

- `home-board-canvas-scale.spec.mjs` 新增 `.milksha-stage` 背景 `rgb(0, 0, 0)` 斷言（1440×1080、1920×800）。

## 與參考圖差異

- 標題在底圖；DOM 標題隱藏。
- 無 Arial 時 Arimo／系統 sans 略細。
- 翻頁指示器參考圖未含。

## UAT

1. 新底圖、無波浪 SVG。  
2. 3／10／11 筆格位與翻頁。  
3. 視窗拉成 4:3 或扁屏：外圍黑邊、中間看板完整。  
4. 1920 與 4K 全螢幕無黑邊。
