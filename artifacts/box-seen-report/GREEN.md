# Box seen report — green

## QA correction (item 1 cancelled)

Payload item time fields stay **with `At`** (milksha-cloud PR #45):

1. `firstDataAtLocalMs`
2. `firstPaintAtLocalMs`
3. `firstDataAtCorrectedMs`
4. `firstPaintAtCorrectedMs`

Contract: `js/board/box-seen-payload-contract.js`

## Commits (At revert)

| | SHA |
|---|-----|
| Red (At names in tests) | `7317f9e` |
| Green (revert payload keys) | `604c7a4` |

## Kept from QA

- `tests/pos-receive-log-status.test.js` — items 23/24, no `—`
- `tests/box-seen-report-localstorage-resilience.test.js`
- PR title: full IP (no 遮罩)

## Unit suite (3× vs `main`)

| Run | pass | fail | tests |
|-----|------|------|-------|
| 1 | 374 | 10 | 384 |
| 2 | 374 | 10 | 384 |
| 3 | 374 | 10 | 384 |

Same 10 layout-harness failures as `main`.
