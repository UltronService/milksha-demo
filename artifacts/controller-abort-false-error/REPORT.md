# Controller false red after successful push_numbers

## Hypothesis (confirmed)

After `devCommand` `push_numbers` returns HTTP 200, `pushNumbersViaDevCommand()` awaits `refreshBoardLists()` (Firestore GET `today_board`). The 4s poll also calls `refreshBoardLists()`. `js/transport/firestore-rest.js` aborts the older in-flight GET when a new GET for the same path starts. The aborted post-send read surfaced as a connect error (`httpStatus: 0`, 「雲端暫時出錯。請稍後再連線。」) via `sendQuickDemoNumber()` → `presentConnectError()`, and rolled back the local ticket even though the board already had the number.

## Red before (main @ c7ba3ba, pre-fix)

Unit (`tests/controller-post-send-board-refresh.test.js` on main without controller wiring):

- `post-send refresh ignores superseded AbortError` → **FAIL** (`AbortError: signal is aborted without reason`)
- `real push_numbers failure still surfaces error and rolls back` → **FAIL** (rollback count assertion on buggy simulation)

Fake-cloud overlap e2e (same repro shape as QA): alert visible, `httpStatus: 0`, 「…請稍後再**連線**」, local list cleared while board shows the number.

## Green after (this branch)

| Suite | Count | Result |
|-------|------:|--------|
| Unit (`npm test`) | 190 | pass |
| New unit files | 5 cases in `controller-post-send-board-refresh.test.js` + `firestore-rest-inflight-abort.test.js` | pass |
| New e2e | 2 in `tests/e2e/controller-post-send-board-read-abort.spec.mjs` | pass |

## Fix (minimal)

1. **`push_numbers` success is decided only by `devCommand` response** — post-send `refreshBoardLists()` is best-effort; failures (including superseded in-flight abort / `Failed to fetch`) do not fail the send or roll back.
2. **`BoardRefreshAfterCommand`** — treats superseded read aborts as non-errors when refresh is attempted.
3. **`firestore-rest.js`** — when `signal.aborted`, normalize to `AbortError` (browser may throw `TypeError: Failed to fetch`).
4. **`sendQuickDemoNumber` catch** — ignore superseded read aborts (defense in depth).
5. **Unchanged:** 4s poll interval; single in-flight abort per path for other callers.

## Live QA (zz-qa-ci-store / stb-01)

Skipped: `QA_WEB_API_KEY` not available in this environment. Use uploaded `repro-cloud-error.mjs` locally when key is present.

## CI

- Branch SHA: `093c587`
- GitHub Actions run id: _(pending)_
