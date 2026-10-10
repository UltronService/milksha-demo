# fix(board): 每格只顯示一個號碼 — REPORT

## Root cause

見 [ROOT-CAUSE.md](./ROOT-CAUSE.md)。`syncZone` 在淡出舊 chip 時未釋放 slot，新號碼 append 至同一 cell → 視覺黏成 8 位數。

## Fix

- `detachChipFromSlotForFade`：淡出 chip 移出 slot，於 numbers layer 絕對定位續播動畫。
- `evictExtraChipsFromSlot`：插入前清掉 slot 內多餘 chip。
- `removeOrphanLayerFloatChips`：`cancelAll` / `syncZone` 清掉已取消的浮層 chip，避免 peak 堆疊。
- CSS：`.milksha-board-chip--layer-float` z-index。

**變更檔：** `js/board/milksha-board-anim.js`、`css/milksha-board.css`

## Tests：main FAIL / branch PASS

執行：`node scripts/verify-concat-tests-main-vs-branch.mjs`  
完整輸出：[test-main-vs-branch.log](./test-main-vs-branch.log)

| 測試 | main (`origin/main` anim) | fix branch |
|------|---------------------------|------------|
| `tests/board-cell-integrity.test.js`（sync 當下 mid-sync） | **FAIL** `chips:2` slot 0/1 | **PASS** |
| e2e `prep slot swap during fade-out` | **FAIL** `20252039` / `20222038` | **PASS** |

## Local test results（branch）

| 項目 | 結果 |
|------|------|
| `npm test` | 182/182 pass |
| `board-cell-single-number.spec.mjs`（含 fade / pulse / page turn / burst） | 6/6 pass（不含 3-min peak） |
| `board-animation.spec.mjs` | 與上同批 CI |
| `playwright test tests/e2e`（全量） | 進行中 → [full-e2e.log](./full-e2e.log) |
| 3-min peak + detached drain | **1 passed (3.1m)** → [peak-3min.log](./peak-3min.log) |

### main FAIL 摘要（e2e）

```
cell-chip-count chipCount:2 text:"20252039" nums:["2025","2039"]
cell-chip-count chipCount:2 text:"20222038" nums:["2022","2038"]
```

### main FAIL 摘要（unit mid-sync）

```
mid-sync glued cells: [{"slot":0,"chips":2,"text":"2025"},{"slot":1,"chips":2,"text":"2022"}]
```

## Commit / CI

- Branch: `cursor/fix-board-concat-numbers-a2ca`
- PR: https://github.com/UltronService/milksha-demo/pull/39
- **Final SHA:** `6ded556c4eb5d7905459894f9359513509adbd65`
- **CI run:** https://github.com/UltronService/milksha-demo/actions/runs/38040105330 （`in_progress` → 完成後更新 conclusion）

## Manual UAT

1. 開 `/?mode=local` 看板。
2. 快速連續改兩批準備中號碼（或 controller 尖峰模擬）。
3. 每格僅一個 4 位號；無 8 位黏字；動畫結束後無殘留浮層 chip。

## 後續（未含本 PR）

- 16:53 欄位溢位動畫：獨立 PR（ROOT-CAUSE.md）
- 16:55 號碼規則：fix 合併後新分支（ROOT-CAUSE.md）
