# Column-move animation — delivery report

**Branch:** `cursor/column-move-animation-a2ca`  
**PR:** https://github.com/UltronService/milksha-demo/pull/46  
**QA fix:** newest-first slot 0 = fade/pulse (ready 1.3×); slot-4 chip pushed to slot 5 via down-out + enter-from-above (not `addedId`).

## Red → green (QA aa87361)

| Issue | Fix |
|-------|-----|
| HIGH: new ready/prep used enter-from-above | `columnMoveEnterFromAboveIds` only for **`pushedId`** (prev slot 4); new at slot 0 uses fade / `runReadyPulseAnim` |
| MED1: diagonal FLIP on pushed chip | `columnMoveSkipFlipIds` for all moves; pushed chip enter-from-above at slot 5; exit clone unchanged |
| MED2: only 5→6 detected | `left-column-overflow` for **prevN 5..9**, enterSlot 0; page-2 `right-bottom-page-two` when 11 items |
| MED3: loose tests | E2e: per-step 6–10 prep+ready, pulse on new ready, slot-4 exit + slot-5 enter, horizontal guard, exact slot order |

## Local verification

```text
npm test → 204 pass (incl. board-ready-fade-regression + column-move-plan)
npx playwright test tests/e2e/board-column-move.spec.mjs → 20/20
board-ready-fade-*.spec.mjs, board-ready-scale-overlap-grid (spot), board-cell-peak smoke
```

## CI

- Pending single push (live-cloud queue): _(URL after green)_

## Contact sheets

- `artifacts/column-move/screenshots/column-move-prep-1080p.png`, `column-move-prep-4k.png`
