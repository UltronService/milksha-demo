# Board motion items 2–3 (core scope)

**Branch:** `cursor/board-motion-items-2-3-a2ca`  
**PR:** https://github.com/UltronService/milksha-demo/pull/52  
**Scope:** In-place leave fade + transparency / visibility cleanup (motion items 2–3). **Reverse backfill deferred** to a follow-up PR.

## Changes

| Area | Behavior |
|------|----------|
| Removed chips | CSS in-place opacity fade (`cssInPlace`); no float detach; placement waits on fade |
| Sync | Clear stuck `visibility` / `transition`; `data-fade-out` respected in FLIP + orphan cleanup |
| Column move (#46 on main) | Unchanged path; rb exit clone hidden via `snapOpacity(0)` before clone |

**Asset:** `20261011s` (merged with main @ `0ed3056` page-turn #53)

## Verify locally

```text
npm test
npx playwright test tests/e2e/board-motion-items-red.spec.mjs
npx playwright test tests/e2e/board-animation.spec.mjs
npx playwright test tests/e2e/board-column-move.spec.mjs
```
