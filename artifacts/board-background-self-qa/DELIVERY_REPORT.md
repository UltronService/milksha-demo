# Board background self-QA (1007)

- **HEAD:** `05eb1c308c386762b9064341d29457fe582b87f8`（見 PR 最後 commit）
- **Base 分支:** `cursor/fixed-16-9-board-canvas-scale-6c7e`（PR #25）
- **產出時間:** 2026-10-08 UTC

## 變更摘要

- 橫向 1920×1080 畫布使用 `assets/milksha-board-bg-1007.jpg` 全幅底圖（隨 #25 canvas scale 等比縮放）。
- 號碼字型 `Arial, Arimo, sans-serif`（Arimo 由 Google Fonts 載入，未打包 Arial 字型檔）。
- 準備中／請取餐區塊底色與 cream 面板改透明，疊在底圖上；標題保留 DOM（`visibility:hidden`）供 e2e／無障礙，視覺以底圖標題為準。
- 未修改 `js/receiver/cloud-runtime.js`。

## 自測指令

| 項目 | 結果 |
|------|------|
| `npm test` | 130 / 130 pass |
| `npm run test:e2e`（全量，未 `fuser -k 8877`） | 120 pass，4 skipped，1 fail（見下） |
| `node scripts/board-background-self-qa.mjs` | 8 張截圖 + 1 張並排比對 |

### E2E 失敗（與底圖無關）

- `guest-clock.spec.mjs` › ring overlay fit widest 4-digit：`requirePlatformFamily /^Roboto/i` 在本機 headless 得到 `DejaVu Sans`（字型環境差異）。重跑仍失敗；CI（GitHub Actions）通常具 Roboto，預期與 main 一致。

### 看板相關 e2e（全過）

- `home-board-layout`、`home-board-canvas-scale`、`home-board-background-tab`、`home-board-background-6min`、`home-board-ten-send-clear`（看板不重載）、`legacy-settings-two-store`（legacy 設定）、`home-board-bare-root-cloud` 等。

## 截圖路徑

`artifacts/board-background-self-qa/screenshots/`

| 檔名 | 說明 |
|------|------|
| `board-empty-0-1920.png` / `3840` | 0 筆 |
| `board-three-3-1920.png` / `3840` | 準備中 3 筆 |
| `board-full-10-1920.png` / `3840` | 各區 10 筆 |
| `board-page2-11-1920.png` / `3840` | 各區 11 筆（翻頁） |
| `compare-full-10-vs-ref-1920.png` | 實作 vs `reference/milksha-board-numbers-ref-1007.jpg` 並排 |

參考圖僅含 10 筆排版，0／3／11 筆以底圖空白 cream 區對齊為準。

## 與參考圖差異

1. **標題**：參考為設計稿合成；實作以底圖標題為主，DOM 標題隱藏，避免雙層字。
2. **字型**：號碼在無 Arial 的環境會落 Arimo／系統 sans，筆畫略細於參考稿。
3. **垂直微調**：cream 透明格使用 `titleTop/titleH/creamPad` 與 `max-width/height 836×832` 對齊底圖；若實機 STB 字級不同，可能需 ±2% 微調。
4. **翻頁指示器**：超過 10 筆時右下角 `1/2` 為功能元素，參考圖未含。

## UAT（PM）

1. 開本機 `/?mode=local` 看板，確認左右為新底圖（綠／黃），無舊波浪 SVG。
2. 控制器送 3 個準備中號碼：應出現在左 cream 區左上起、先左欄再右欄。
3. 送滿 10 筆：兩欄各 5 行；第 11 筆後約 6 秒應見 `2/2` 翻頁。
4. 瀏覽器視窗改 3840×2160：整面等比放大、不裁切、號碼仍在 cream 內。
5. 開第二分頁控制器送號：看板分頁在背景仍應更新（e2e 已驗）。
