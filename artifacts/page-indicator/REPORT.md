# 分頁指示器（Item 1）修復報告

## 問題
橫式 art 看板在**增量更新**（`updateZonePageIndicator`）時，指示器掛在 zone 上但 `--art` CSS 清掉 `right/bottom` 又無 inline 座標，會跑到 zone 左上角；另 `renderZoneHtmlArt` 少關一層 `</div>`，導致 ready 區嵌在 prep 內，選器與指示器錯位。

## 修復（未改 `milksha-board-anim.js`）
- 統一 token：`PAGE_INDICATOR_FONT_PX=28`、`PAGE_INDICATOR_INSET_PX=16`，CSS `--milksha-pg-ind-*`，色 `rgba(34,34,34,0.55)`，字體與號碼相同。
- 指示器改放在各區 `.milksha-zone-numbers` 內（隨翻頁 layer 0.5s fade，不另做動畫）。
- `artPageIndicatorAnchorPx` + `transform: translate(-100%,-100%)`：cream 框右下 16px（1920×1080 設計座標，4K 隨 canvas scale）。
- `updateZonePageIndicator` / `patchZonePage` 與首次 `renderZoneHtmlArt` 共用定位；單頁移除 DOM。
- 修正 art zone HTML 閉合標籤；zone 查詢改 `.milksha-zone.milksha-prep|milksha-ready`。

## 紅→綠
| 階段 | 指令 | 結果 |
|------|------|------|
| 紅（main） | `npx playwright test tests/e2e/board-page-indicator.spec.mjs` | `incremental update` 失敗（指示器在 cream 外） |
| 綠（本分支） | 同上 + screenshots | 7/7 通過 |

## 截圖（CI / 本機 `artifacts/page-indicator/`）
| 檔案 | 說明 |
|------|------|
| `board-indicators-1080p.png` | prep **1/2**、ready **2/3** @ 1920×1080 |
| `board-indicators-4k.png` | 同上 @ 3840×2160 |
| `board-indicators-single-page-1080p.png` | 單頁無指示器 @ 1080p |
| `board-indicators-single-page-4k.png` | 單頁無指示器 @ 4K |

## 手動驗收（UAT）
1. 本機 `npm ci && npx playwright install chromium`。
2. 跑 `npx playwright test tests/e2e/board-page-indicator.spec.mjs tests/e2e/board-page-indicator-screenshots.spec.mjs`。
3. 打開上述 PNG，確認指示器在**奶黃框右下**、字級約 28px（1080p）、單頁畫面無「1/2」。
