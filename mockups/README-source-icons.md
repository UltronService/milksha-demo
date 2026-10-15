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

## 字級 vs live

| 項目 | live 看板 | mockup |
|------|-----------|--------|
| `--milksha-num-font` | **81px**（`LandscapeArtLayout.NUM_FONT_PX`） | **81px**（未改） |
| 請取餐／準備中字級比 | 1:1 | 1:1 |
| 含 icon 整列縮放 | — | prep **~0.79×**、ready **~0.78×**（`--source-icons-chip-scale`，全區一致） |

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
