# 來源 icon 版面 mockup（非正式看板）

靜態預覽頁，使用客戶官方 PNG（`assets/source-icons/`），**不**載入 `milksha-board.js`。

## 檔案

| 路徑 | 說明 |
|------|------|
| `mockups/source-icons.html` | 全板 1920×1080（1007 底圖 + 準備中／請取餐格） |
| `mockups/source-icons-zoom.html` | 四種來源各一筆特寫（含 6 碼） |
| `mockups/source-icons.css` | mockup 專用樣式 |
| `assets/source-icons/*.png` | 官方 icon（未改圖） |

## 規則摘要

- 門市號碼：**無** icon。
- 迷點（你訂 wordmark）：以 **高度** 對齊方形 icon 視覺重量。
- Uber / foodpanda：58×58 槽，`object-fit: contain`，透明底、不 recolor。
- 號碼：**Arial Regular 400**，準備中 81px；請取餐列 **1.3×**（與 live `readyScale` 預設一致）。
- 六碼 + icon：該區**統一** `--mockup-zone-display-scale`（請取餐先 1.3×，全區等比縮到最寬列可放進欄寬）；**禁止**單格縮放
- 欄位：依 cream 內緣 + 中縫 gap 切兩欄，號碼左對齊、118px icon 槽在左

## 邊界自動檢查

```bash
node scripts/check-source-icons-mockup.mjs
```

產出 `mockups/artifacts/source-icons-mockup/layout-check.json`（cream 內、欄間 gap、icon–數字 gap、同區 scale 一致）。

## 截圖

```bash
node scripts/capture-source-icons-mockup.mjs
```

（會先跑 layout check，失敗不截圖）

產出：`mockups/artifacts/source-icons-mockup/*.png`

## UAT（PM）

1. 用 Chrome 開 `mockups/source-icons.html`（視窗設 1920×1080 或全螢幕 F11）。
2. 確認左「準備中」、右「請取餐」底圖與正式看板相同。
3. 任選一格 Uber：左側為綠色 Uber 方圖，右側英數大寫，**字體不粗**。
4. 任選一格 foodpanda：粉紅熊貓在方框內完整顯示，**四周無白邊**。
5. 任選一格迷點：藍粉「你訂」字標在號碼左，高度與 Uber 方圖接近。
6. 門市四碼（如 1985、2216）：**只有數字**，左側無圖。
7. 開 `source-icons-zoom.html`：四列分別為門市、迷點、Uber 六碼、熊貓六碼，間距一致。
