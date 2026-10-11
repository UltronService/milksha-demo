# Controller `push_numbers` 409 `stale_list`

## Goal

When milksha-cloud returns HTTP **409** with `{ error: 'stale_list' }` on `push_numbers`, treat it as a superseded list (not a failure): no red UI, keep `#45` AbortError behavior, sync controller tickets from `today_board` via `refreshBoardLists`.

## TDD (red → green)

### Red (on `origin/main`)

- `tests/controller-command-errors.test.js`: `resolveErrorCode` did not read `response.error`; no `isStaleListConflict`.
- `tests/controller-post-send-board-refresh.test.js`: stale_list mapped to internal error messages.
- E2e: 409 on `push_numbers` showed `command-error-alert` + `user-banner` with 「雲端暫時出錯」 and rolled back `#list-ready` (manual probe / pre-fix behavior).

### Green

**Unit**

```bash
npm test
```

**Controller e2e (fake-cloud)**

```bash
npx playwright test controller-post-send-board-read-abort.spec.mjs
```

Covers:

- `#45` superseded board GET after successful push (unchanged)
- **409 `stale_list`**: no red alert/banner, UI ready list matches `today_board` after refresh
- **500 regression**: red 「雲端暫時出錯」 + local rollback

## Code changes (controller + transport only)

| File | Change |
|------|--------|
| `js/transport/controller-command-errors.js` | Map `response.error`; `isStaleListConflict`; empty user messages for stale |
| `controller/controller-app.js` | `pushNumbersViaDevCommand`: stale → refresh + `{ staleList: true }`; send paths skip bump/rollback on stale |

## CI

Filled in after push (SHA + Actions URL).
