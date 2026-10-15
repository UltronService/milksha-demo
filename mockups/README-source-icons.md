# 來源 icon mockup（live board 疊加）

使用與正式看板相同 boot 路徑（`js/milksha-board.js` + `css/milksha-board.css`），**背景／標題／cream 框**皆來自官方 JPEG，僅疊加 sample 號碼與 icon overlay。

## 正式看板背景檔

| 項目 | 值 |
|------|-----|
| 檔案 | **`assets/milksha-board-bg-1007.jpg`** |
| 程式常數 | `js/milksha-board.js` → `BOARD_BG_SRC` |
| 橫式 1920×1080 | `landscape-art-layout.js` art grid |

## 檔案

| 路徑 | 說明 |
|------|------|
| `mockups/source-icons.html` | Live board + icon overlay（預設） |
| `mockups/source-icons.html?baseline=1` | 空板（對照用） |
| `mockups/source-icons.html?baseline=numbers` | 同 sample 號碼、**無** icon |
| `mockups/source-icons-overlay.js` / `.css` | 僅 mockup 注入與 chip 縮放 |
| `assets/source-icons/*.png` | 客戶官方 icon |

## 號碼規則（一律走 production）

| 規則 | 實作來源 |
|------|----------|
| Arial Regular **400** | `css/milksha-board.css` → `.milksha-num` |
| 2 欄 × 5 列、每頁 10 筆 | `MilkshaBoard.PAGE_SIZE` / `layoutPageGrid` |
| 最新左上、先填左欄再右欄 | `layoutPageGrid` + `compareNewestFirst` 排序 |
| 號碼格式（門市 4 碼、迷點 3–4 碼保留前導 0、Uber 3–6 英數大寫、熊貓最長 6） | `normalizeBoardDisplayNumber` |
| **熊貓顯示 `#640609`** | **mock only**（`formatFoodpandaMockDisplay`）；**live 仍會 strip `#`**，上線需改 production |
| icon fit 最寬列 | **`#` + 6 碼**（`FP_WORST_CASE_DISPLAY` = `#999999`）+ icon |
| 門市無 icon | overlay 略過 `store` |
| **請取餐 1.3×** | **`readyScale` 新號 pulse**（`MilkshaBoardAnimConfig`，預設 1.3），**不是**常駐 CSS 字級；靜態字級兩區皆 **81px** |

Mock 資料經 `buildPayload()` → `applyPayload()` → `partitionNumberContent()`，**不**在 mock 內重寫排版或格式。

## 字級 vs live（含 icon 時如何縮）

| 項目 | live 看板 | mockup |
|------|-----------|--------|
| `--milksha-num-font` | **81px** | **81px**（`prepFontShrinkFromLivePx` / `readyFontShrinkFromLivePx` = **0**） |
| 請取餐／準備中 **靜態**字級比 | 1:1 | 1:1 |
| 請取餐 **pulse** 峰值 | **1.3×** transform | 同 production（mock 靜態截圖不播 pulse） |
| 為塞下 icon + 6 字 | — | **整列 chip `scale`**（見 `layout-check.json` → `iconFitAdaptation`），**不**偷偷改 CSS 字級 |

若未來必須改小字級才能 fit，腳本會 fail 並在 `iconFitAdaptation` 寫明 shrink 像素；目前策略為 `chip-scale`。

## Owner hold（暫停改字級／比例）

在負責人回覆前**不要**再調 CSS 字級或 chip scale 策略：

1. **`#` 是否算進熊貓 6 字上限**
2. **請取餐 1.3× 是否保留**（pulse vs 靜態字級）

Agent Store 最新全板／特寫：`artifacts/source-icons-full-board.png`、`source-icons-zoom-crop.png`（commit **0d48c1e**，見 `source-icons-manifest.json`）。

## QA

```bash
node scripts/check-source-icons-mockup.mjs      # 像素 cream + bbox
node scripts/capture-source-icons-mockup.mjs    # 1920×1080 截圖
node scripts/compare-source-icons-background.mjs # 空板 vs mock 非 cream 像素比對
node --test tests/source-icons-mockup-layout.test.js
```

背景一致性：`live-board-baseline-1920x1080.png`（空 live board）vs `source-icons-full-1920x1080.png` 的 **non-cream 像素** 應完全一致（見 `background-compare.json`）。

## UAT

1. 本機 `npx serve` 或 capture 腳本開 `http://127.0.0.1:<port>/mockups/source-icons.html`
2. 對照 `?baseline=1`：標題／綠黃底／cream 框與 GitHub Pages 看板相同
3. 預設頁：僅多左側官方 icon；號碼仍 Arial 400、81px
