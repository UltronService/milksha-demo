# Box seen report — green (QA #112 follow-up)

## Commits

| Milestone | SHA |
|-----------|-----|
| Backend payload field names (red) | `8fa1596` |
| Backend payload + resilience (green) | see `git log -1` on branch |

## Backend item time fields (exact)

1. `firstDataLocalMs`
2. `firstPaintLocalMs`
3. `firstDataCorrectedMs`
4. `firstPaintCorrectedMs`

Contract: `js/board/box-seen-payload-contract.js`

## Unit suite (3× vs `main`)

| Run | pass | fail | tests |
|-----|------|------|-------|
| 1 | 374 | 10 | 384 |
| 2 | 374 | 10 | 384 |
| 3 | 374 | 10 | 384 |

`main`: 342 pass / 10 fail (352 tests). Same 10 layout-harness failures only (+32 new tests on branch).

## New QA tests

- `tests/box-seen-report-payload-contract.test.js`
- `tests/pos-receive-log-status.test.js` (items 23/24: 未回報 / 未校正, no `—`)
- `tests/box-seen-report-localstorage-resilience.test.js`
