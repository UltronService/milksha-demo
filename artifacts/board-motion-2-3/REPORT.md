# Board motion items 2–3 — delivery report

**Branch:** `cursor/board-motion-items-2-3-a2ca`  
**PR:** https://github.com/UltronService/milksha-demo/pull/52

## Reverse backfill boundary 1–10 (TDD)

| # | Test | Red cause | Green fix |
|---|------|-----------|-----------|
| 1 | prep right-top slides up/out | Wrong payload (`prepPayload` on rows); short poll | Apply `zoneRows` directly; exit-clone slot sampling |
| 2 | prep enter left-bottom from below | Same payload bug | `chipMotionSampleLeftBottomMotion` + long poll |
| 3 | prep other right chips slide up | Follower hidden during FLIP / slot probe | `chipMotionSampleColumnSlot` at slot 6 |
| 4–6 | ready mirror of 1–3 | Same | Same helpers on ready zone |
| 7 | both zones vertical / no overlap | `getBoundingClientRect` column leak vs transform | Transform `tx` while visible; hide during backfill skip-FLIP |
| 8 | one chip per cell | — | Already green once payload fixed |
| 9 | settle order + opacity 1 | — | `assertZoneSlotOrderExact` |
| 10 | 1080p + 4K contact sheets | — | `artifacts/board-motion-2-3/screenshots/backfill-prep-{1080p,4k}.png` |
| + | page-2 fade right-bottom | Moved chip skipped CSS fade; short sample | `pageTwoFadeInIds` + `scheduleChipCssFadeIn`; slot opacity poll |

Spec: `tests/e2e/board-motion-backfill-boundary.spec.mjs`  
Helpers: `tests/e2e/board-motion-backfill-helpers.mjs`

## Items 2–3 + QA

| Item | Spec / unit |
|------|-------------|
| 2 in-place leave fade | `board-motion-items-red.spec.mjs` |
| 3 no overlap | same + `board-motion-backfill.test.js` |
| QA #46 opacity interrupt | `snapOpacity(1)` after skip-FLIP |

## Local verification

```text
npm test → 211 pass
npx playwright test tests/e2e/board-motion-backfill-boundary.spec.mjs → 11/11
npx playwright test tests/e2e/board-motion-items-red.spec.mjs → 2/2
npx playwright test tests/e2e/board-column-move.spec.mjs → 20/20 (may need re-run if arrival sampling flakes)
```

Asset: **`20261011j`**

## CI

- SHA: _(after push)_
- URL: _(when green)_
