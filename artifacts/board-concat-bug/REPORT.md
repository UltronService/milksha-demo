# fix(board): 每格只顯示一個號碼 — REPORT

## Root cause

見 [ROOT-CAUSE.md](./ROOT-CAUSE.md)。`syncZone` 在淡出舊 chip 時未釋放 slot，新號碼 append 至同一 cell → 視覺黏成 8 位數。

## Fix

- `detachChipFromSlotForFade`：淡出 chip 移出 slot，於 numbers layer 絕對定位續播動畫。
- `evictExtraChipsFromSlot`：插入前清掉 slot 內多餘 chip。
- CSS：`.milksha-board-chip--layer-float` z-index。

**變更檔：** `js/board/milksha-board-anim.js`、`css/milksha-board.css`

## Tests

| 項目 | 結果 |
|------|------|
| `npm test` | 182/182 pass（含 `tests/board-cell-integrity.test.js`） |
| `playwright` board-animation + board-cell-single-number | 16/16 pass |
| `playwright test tests/e2e`（全量） | 見 PR CI |

## Repro（修復前 main）

50ms 內將 prep `2025/2022` 換成 `2039/2038` → cell `textContent` 為 `20252039`、`20222038`（各 2 chips）。修復後 `bad []`。

## Commit

- Branch: `cursor/fix-board-concat-numbers-a2ca`
- SHA: `e5eb9b8`（推送後以 PR CI 為準）

## Manual UAT

1. 開 `/?mode=local` 看板，DevTools 確認動畫未關閉。
2. 快速連續送兩批不同準備中號碼（或開 controller 模擬 peak）。
3. 準備中每格僅一個 4 位號；不出現 8 位黏字。
4. 請取餐 1.3x pulse 仍正常。

## 後續（未含本 PR）

- 16:53 欄位溢位動畫：獨立 PR，ETA 3–5h（見 ROOT-CAUSE.md）。
- 16:55 號碼規則：獨立 PR，ETA 3–4h（見 ROOT-CAUSE.md）。
