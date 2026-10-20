# Box seen report — green

## Commits

- Log format: `c094f00`
- Full reporter: `095dd06`

## Unit suite (3× vs `main`)

| Run | pass | fail | tests |
|-----|------|------|-------|
| 1 | 365 | 10 | 375 |
| 2 | 365 | 10 | 375 |
| 3 | 365 | 10 | 375 |

`main` baseline: 342 pass / 10 fail (352 tests). Same 10 layout-harness failures; +23 new tests all pass.

## New tests

```bash
node --test tests/box-seen-report*.test.js tests/pos-receive-log*.test.js
```

## Mutation checks

- `tests/box-seen-report-mutation.test.js` — `firstIntakeLogId` skip guard present in source
- `tests/box-seen-report-cloud-api.test.js` — `boxSeenReport` does not call `markUploadHaltedFrom403`

## IP display (director)

- `formatIpForDisplay` in `js/tools/pos-receive-log-format.js` returns full trimmed IP; one-line change later for mask.

## Manual UAT (zz-qa-* / fake-cloud)

1. Open home board `?mode=local&store=zz-qa-store-a` with fake-cloud.
2. Confirm `localStorage.milksha:boxId` set; `?boxId=` overrides when valid 8–64 chars.
3. Push ticket with `firstIntakeLogId` via fake-cloud board update; number paints → one `boxSeenReport` POST (batched).
4. Reload board: same ticket not reported again.
5. Break `boxSeenReport` (500): board/paging still works; no 連線暫停.
6. `tools/pos-receive-log/index.html`: delay column **比收件晚（秒）**, 未回報 / 未校正 text.
