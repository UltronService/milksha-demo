# Box seen report — green

## Commits

- Log format: `c094f00`
- Full reporter: `38481a4`
- STB reload / capped reported store: see latest green on branch

## Android STB schedule switch (follow-up)

| Item | Before | After |
|------|--------|-------|
| `boxId` after page reopen | **Met** (`milksha:boxId` in localStorage) | Test `box-seen-report-reload.test.js` |
| No re-report same `storeId+ticketNo+intakeLogId` | **Met** (localStorage dedupe) but unbounded `v1` per `storeId:boxId` | **Fixed**: `v2` per `storeId`, max **500** entries, drop oldest |
| 1h memory | Risk unbounded reported object | Bounded store (~few KB per store) |

- Red: `ba293e4` (3 failing)
- Green: `62d5200`

## Unit suite (3× vs `main`)

| Run | pass | fail | tests |
|-----|------|------|-------|
| 1 | 368 | 10 | 378 |
| 2 | 368 | 10 | 378 |
| 3 | 368 | 10 | 378 |

`main` baseline: 342 pass / 10 fail (352 tests). Same 10 layout-harness failures only.

## New tests

```bash
node --test tests/box-seen-report*.test.js tests/pos-receive-log*.test.js
```

## Mutation checks

- `tests/box-seen-report-mutation.test.js` — `firstIntakeLogId` skip guard present in source
- `tests/box-seen-report-cloud-api.test.js` — `boxSeenReport` does not call `markUploadHaltedFrom403`

## IP display (director)

- `formatIpForDisplay` returns full trimmed IP (one-line mask switch later).

## Manual UAT (zz-qa-* / fake-cloud)

1. Open home board `?mode=local&store=zz-qa-store-a` with fake-cloud.
2. Confirm `localStorage.milksha:boxId` set; reload page → same `boxId`.
3. Push ticket with `firstIntakeLogId`; paint → one `boxSeenReport`.
4. Close/reopen board (localStorage kept): same ticket **no** second report.
5. `tools/pos-receive-log/index.html`: delay / 未回報 / 未校正.
