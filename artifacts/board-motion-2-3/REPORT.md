# Board motion items 2–3 — delivery report

**Branch:** `cursor/board-motion-items-2-3-a2ca`  
**Base:** `main` @ #46 merged

## Red → green

| Test | Fix |
|------|-----|
| Item 2 (PR #47) leaving fade in place | CSS-transition fade-out (WAAPI-safe), `data-fade-out` guards, no FLIP on fade chips, defer slot reparent until removed fade completes |
| Item 3 backfill no overlap | `left-column-backfill-removal` plan: slide up-out clone, enter left-bottom from below, vertical-only FLIP; sequence after removed fade + exit clone before reparent |
| QA #46 skip-FLIP opacity | `snapOpacity(chip, 1)` always after vertical skip-FLIP translate (no `ensureVisibleOpacity`-only on interrupt) |
| Column-move #46 regressions | Fade float cleanup on `cancelAll`; page-2 exit clone sampling; `rbChip` hidden during exit clone |

## Local verification

```text
npm test (incl. asset-version + board-motion-backfill)
npx playwright test tests/e2e/board-motion-items-red.spec.mjs → 2/2
npx playwright test tests/e2e/board-column-move.spec.mjs → 20/20
```

Asset bump: **`20261011m`**

## CI

- Pending push → _(URL when green)_
