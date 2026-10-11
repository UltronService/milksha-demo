# 分頁指示器（Item 1）修復報告

## 問題
1. **增量更新**：指示器掛在 zone 上但 `--art` CSS 清掉 `right/bottom` 又無 inline 座標，會跑到 zone 左上角。
2. **DOM 嵌套**：`renderZoneHtmlArt` 在 `.milksha-zone-numbers` 後只關一層 `</div>`，**少關 zone 外層**，ready 區 HTML 被解析成 prep 的子節點；`.milksha-ready` 選器與增量更新找錯區。
3. **視覺 vs 舊測**：舊測以 numbers layer 或 `translate(-100%, -100%)` 對齊「錨點」，等效量到 ~100px 高的 box，指示器與最後一列號碼同高（y≈876），距**可見奶黃框**底邊 ~100px 而非 16px。

## 修復（未改 `milksha-board-anim.js`）
- Token：`PAGE_INDICATOR_FONT_PX=28`、`PAGE_INDICATOR_INSET_PX=16`；色 `rgba(34,34,34,0.55)`。
- 定位基準：**可見奶黃框** `LandscapeArtLayout.creamRectForZone(zoneKey)`（繪製用 cream 矩形，非 numbers layer 外框）。
  - `left = creamRight - zoneLeft - 16`（`translateX(-100%)`，右緣距 cream 右 16px）
  - `top = creamBottom - 16 - 28`（底緣距 cream 底 16px，含 28px 字高）
- 指示器在 `.milksha-zone-numbers` 內，隨翻頁 layer **0.5s opacity fade**（不另做動畫）。
- `renderZoneHtmlArt`：numbers 層 `</div>` 後**再補 zone** `</div>`；zone 查詢 `.milksha-zone.milksha-prep|milksha-ready`。
- prep / ready 仍為看板同層兄弟節點（修正後 DOM 與橫式 art 設計一致）。

## 測試（量對 box）
- `measurePageIndicatorPlayout`：`creamRectForZone` → `marginRight` / `marginBottom` 須 **16±3px**；`minChipGap` **≥12px**（所有 `.milksha-board-chip` bbox）。
- 涵蓋：1080p 增量、ready 2/3、4K、ready 右下角 **1.3× pulse**（cell 9）期間間距。
- **`home-board-art-alignment.spec.mjs`**：未改 grid/cream 常數，本分支仍通過（號碼對位不受指示器影響）。

## 紅→綠
| 階段 | 指令 | 結果 |
|------|------|------|
| 紅（舊測） | 以 layer/translate 量測 | 綠但 QA 截圖不符 cream 16px |
| 紅（新測 @ 舊程式） | `board-page-indicator.spec.mjs` | inset / chip gap 失敗 |
| 綠（本分支） | 同上 + screenshots + art-alignment | 11/11 通過 |

## 截圖（`artifacts/page-indicator/`）
| 檔案 | 說明 |
|------|------|
| `board-indicators-1080p.png` | prep **1/2**、ready **2/3** @ 1920×1080 |
| `board-indicators-4k.png` | 同上 @ 3840×2160 |
| `board-indicators-single-page-1080p.png` | 單頁無指示器 @ 1080p |
| `board-indicators-single-page-4k.png` | 單頁無指示器 @ 4K |

## 手動驗收（UAT）
1. `npm ci && npx playwright install chromium`
2. `npx playwright test tests/e2e/board-page-indicator.spec.mjs tests/e2e/board-page-indicator-screenshots.spec.mjs tests/e2e/home-board-art-alignment.spec.mjs`
3. 打開 `board-indicators-1080p.png`：指示器貼**奶黃框**右下內角（非第 5 列號碼旁）；單頁 PNG 無「1/2」。
