# Box seen report — green (final scope)

## Payload item time fields (PR #45, unchanged)

`firstDataAtLocalMs`, `firstPaintAtLocalMs`, `firstDataAtCorrectedMs`, `firstPaintAtCorrectedMs`

## In scope

- `tests/pos-receive-log-status.test.js` — items 23/24: `未回報` / `未校正`, no `—`
- PR #112 title: log page（**完整 IP**）

## Out of scope (removed)

- localStorage corruption / quota tests (item 3, not approved)

## Unit suite (3× vs `main`)

| Run | pass | fail | tests |
|-----|------|------|-------|
| 1 | 372 | 10 | 382 |
| 2 | 372 | 10 | 382 |
| 3 | 372 | 10 | 382 |

Same 10 layout-harness failures as `main`.
