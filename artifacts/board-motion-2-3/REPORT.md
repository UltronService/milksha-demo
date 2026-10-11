# Board motion items 2–3 — delivery report

**Branch:** `cursor/board-motion-items-2-3-a2ca`  
**Base:** `main` @ #46

## Red → green

| Test | Fix |
|------|-----|
| Item 2 (PR #47) leaving fade in place | CSS-transition fade (`cssInPlace`) for removed ids only; `data-fade-out` + defer reparent/FLIP until removed fade completes |
| Item 3 backfill no overlap | `left-column-backfill-removal`: slide up-out clone, enter left-bottom from below, vertical skip-FLIP; sequence after removed fade + exit clone |
| QA #46 skip-FLIP opacity | Always `snapOpacity(chip, 1)` after vertical skip-FLIP translate (interrupt-safe) |
| Column-move #46 regressions | WAAPI stray fades (non-removed); sync placement for overflow; enter sampling uses slot vs id probe |

## Local verification

```text
npm test → 209 pass
npx playwright test tests/e2e/board-motion-items-red.spec.mjs → 2/2
npx playwright test tests/e2e/board-column-move.spec.mjs → 20/20 (single run; arrival loop tests can flake under --repeat-each)
```

Asset bump: **`20261011i`**

## Owner 10-test boundary (item 3 backfill)

PR #47 red tests (items 2 & 3) are in `board-motion-items-red.spec.mjs`. Full prep/ready boundary 1–10 + 1080p/4K contact sheets for **left-column backfill removal** are not duplicated here (column-move boundary 1–10 covers the inverse overflow path on #46).

## CI

- **PR:** https://github.com/UltronService/milksha-demo/pull/52
- **SHA:** `2c2add3b6f049f4c8066197191365791cc966cec`
- **Checks:** _(pending — subscribe for green test + e2e-live-cloud)_
