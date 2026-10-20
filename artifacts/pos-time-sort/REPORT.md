# POS time sort — QA report

## PR
- Branch: `cursor/pos-time-sort`
- PR: https://github.com/UltronService/milksha-demo/pull/111

## TDD red → green

| # | Test | Red (pre-impl) | Green |
|---|------|----------------|-------|
| 1 | Preparing by `firstSeenPosAtMs` desc | Fail (used `Date.now`) | Pass |
| 2 | Ready by `readyPosAtMs` desc | Fail | Pass |
| 3 | Prep→ready uses ready time | Fail | Pass |
| 4 | Late receive, POS order | Fail | Pass |
| 5 | Two boards same order | Fail | Pass |
| 6 | Reload same order | Fail | Pass |
| 7 | Tie: `seqInBatch` | Fail | Pass |
| 8 | Tie: number | Fail | Pass |
| 9 | Delivery + store | Fail | Pass |
| 10 | Fallback `updatedAt` | Fail | Pass |
| 11 | Fallback local receive | Pass on main (legacy) | Pass |
| 12 | Mixed fields no crash | Pass | Pass |
| 13 | Invalid POS time | Fail | Pass |
| 14 | No POS fields (legacy) | Pass on main | Pass |
| 15 | Cache stores ms | Fail | Pass |
| 16 | Boot cache POS order | Fail | Pass |
| 17 | Old cache then cloud | Fail | Pass |
| 18 | Static ready page jump | Pass on main | Pass |
| 19 | Prep no jump on move (#60) | Pass on main | Pass |
| 20 | motion=on layout | Pass on main | Pass |
| 21 | PAGE_SIZE / 6s | Pass | Pass |
| 22 | Central sort module | Fail | Pass |

**Before implementation:** New tests 1–10, 13, 15–17, 22 failed because sorting used local `Date.now()` and tickets did not carry POS ms. Tests 11–12, 14, 18–21 already matched main behavior or constants.

## Unit tests (full `npm test`)
| Branch | tests | pass | fail |
|--------|------:|-----:|-----:|
| `main` | 352 | 342 | 10 |
| PR head | 374 | 364 | 10 |

PR adds 22 tests (all pass); fail count matches `main` (layout/cream-band harness flakes on CI VM).

## Unit tests (focused)
- `node --test tests/milksha-board-pos-time-sort.test.js`: 22/22 pass

## Backend field names (align with cloud)
- `firstSeenPosAtMs`, `readyPosAtMs`, `posTimeSource`, `seqInBatch`, `readySeqInBatch` — mapped in `js/board/board-pos-time-fields.js` (`BOARD_POS_TIME_FIELD`).

## Manual self-QA (fake cloud / `zz-qa-*` only)
1. `npm run fake-cloud` → open `/?mode=cloud&store=zz-qa-store-a` on Chromium and an older WebView if available.
2. Push preparing tickets with different `firstSeenPosAtMs` via fake cloud; confirm order matches POS, not wall clock.
3. Open second board same store; orders match without reload.
4. Leave board open (no reload); push updates — order stable by POS.
5. Background tab 2+ min; foreground — order still POS-based, no white flash (`motion` off default).
