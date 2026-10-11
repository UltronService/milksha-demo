# Page-turn desync fix — 2026-10-11

## Root cause (H1)
`commitBoardView` 每次 `cancelAll` 會中斷進行中的換頁 opacity 動畫，但 DOM 仍停在換頁前的舊頁格；後續 `syncZone` 的換頁動畫把「換格」延遲到 fade 中點，連續 `applyPayload`（QA ~600ms）會反覆取消、永遠到不了中點。`lastRendered*`／頁碼指示器已更新，畫面卻卡在舊第 2 頁（4119／4120 不顯示）。離線重播同序列可 100% 重現。

## Test boundary red → green

| # | 項目 | main | 分支 |
|---|------|------|------|
| 1 | `p2-snaps-compact.json` 離線重播：新 ready ≤1.5s 可見 | RED（4119/4120） | GREEN `board-page-turn-desync.spec.mjs` |
| 2 | 換頁後 0–900ms 注入資料， settle 後指示與號碼同頁 | RED | GREEN |
| 3 | 頁碼與號碼同時淡入淡出（不早 ~250ms） | RED（#48） | GREEN |
| 4 | 第 2 頁無號時不空白滯留 | RED | GREEN |
| 5 | 6 秒換頁節奏未改 | — | GREEN（未動 `PAGE_INTERVAL_MS`） |
| 6 | 每格一號、opacity 1、1080p/4K | RED（desync） | GREEN |

## QA animation acceptance（`uploads/board-animation-acceptance.md`，容差 0）

執行：`node scripts/page-turn-desync-acceptance.mjs` → `artifacts/page-turn-desync/acceptance/acceptance-results.json`

| 條款 | 1080p | 4K | 備註 |
|------|-------|-----|------|
| A1 全程 50ms 採樣 | PASS | PASS | 見各 scenario `frames` |
| A2 白框／標題／chip 不重疊／不斜移 | PASS（page-turn-desync） | PASS | 本 PR 情境 |
| A2 換欄／pulse 期間 diagonal | pre-existing on main | pre-existing on main | `2-call-ready-pulse`：`store:8102` 1.3× scale WAAPI 同時 dx+dy（非本 PR 引入）；#46 column-move 標題區另案 PR #52 |
| A4 1080p + 4K + ready pulse | PASS | PASS | pulse 場景含於 `2-call-ready-pulse` |
| A5 60fps 影片 | PASS | PASS | `artifacts/page-turn-desync/acceptance/video/{1920x1080,3840x2160}/` |
| B1–B3 格 integrity／不透明／排序 | PASS | PASS | e2e + unit 209 pass |
| B4–B6 部署／store 政策 | N/A（本機 acceptance） | N/A | CI 用 zz-qa-ci-store |

## Screenshots（修復後 settle）

| 解析度 | 檔案 |
|--------|------|
| 1080p | `screenshot-1080p.jpg` |
| 4K | `screenshot-4k.jpg` |

## CI（2026-10-11）
- Run: https://github.com/UltronService/milksha-demo/actions/runs/38146389520
- SHA: `38cf72d7472deb3c128cd2f261dbcfb3905a171f`
- `test` + `e2e-live-cloud`: pass

## PR overlap
未修改 `detectColumnMovePlan`／換欄 backfill（PR #52 範圍）。僅 `syncZone` stale-DOM 換頁、`commitBoardView`／`patchZonePage` 指示器時序。

## UAT（PM）
1. 開本地看板 `/?mode=local`，F12 無錯。
2. 連續送 20 個 ready + 11 prep，手動換 ready 第 2 頁後 0.5s 再送第 21 個 ready。
3. 預期：1.5s 內新號出現；頁碼與號碼一致；不卡舊頁。
