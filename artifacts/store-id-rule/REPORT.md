# Store ID rule — implementation report

**Branch:** `cursor/store-id-rule-de1b`  
**PR:** https://github.com/UltronService/milksha-demo/pull/105  
**Head commit:** `08d9c9d` (update after live/CI evidence commit)  
**Asset version:** `20261019a`  
**Date (Taipei):** 2026-10-19

## Rule (owner-approved)

- Valid: `1 letter + 2 digits` (e.g. `a17`, `a00`, `a07`, `x99`) **or** `1 letter + 6 digits` (e.g. `c030020`, `x123456`).
- Reject: letter + 3/4/5/7+ digits; pure digits; multi-letter prefixes.
- Uppercase normalized to lowercase (`A17` → `a17`); no strip/pad (`a17` ≠ `a000017`).
- Display/store id string is full id (e.g. `a17`, never `17`).
- `zz-qa-*` unchanged.

## `zz-deny-*` (not part of new rule)

| Question | Answer |
|----------|--------|
| Accepted on `origin/main` before this PR? | **Yes** |
| Evidence | `controller/store-list.js` on main already had `STORE_ID_ZZ_DENY_RE` and `isValidStoreIdFormat('zz-deny-test')`; `tests/store-list.test.js` on main asserts `zz-deny-test` valid; E2E `controller-store-picker.spec.mjs` / `forbidden-store-then-qa-isolation.spec.mjs` use `zz-deny-test` |
| This PR newly added it? | **No** — preserved for existing fake-cloud / E2E behavior only; not part of the owner-approved production store-id forms |

## Scope checklist

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Accept/reject matrix (unit) | **pass** | `tests/store-id.test.js`, `tests/store-list.test.js`; `npm test` 345 tests, 10 fails (= main) |
| 2 | Board `store=a17` pairs on **milksha-qms-dev** | **pass** | `boardAutoPair` → `ok:true`, `storeNumber:"a17"`. Live Playwright (local tree via Pages route shim): bind hint `a17 2026-10-19 …`, record `storeId/storeNumber: a17`. See `artifacts/store-id-rule/live-a17-evidence.json`. **No send/clear.** |
| 3 | Controller list shows `a17` (display `a17`) | **pass** | Live: `#fld-store` option `測試門市 A17 (a17) · online`. Fake-cloud E2E «a17 appears…» pass locally |
| 4 | POS `milkshaa17` / `c030020` unchanged | **pass** | No POS path edits; demo `validate-request.js` unchanged |
| 5 | `zz-qa-*` still work | **pass** | Unit + existing E2E stores |

**Live caveat (owner):** if `milksha-cloud` main merges unrelated changes, dev may redeploy and drop the a17 rule — re-probe `boardAutoPair` before retrying; do not spam pairing.

## Unit tests

| Metric | Value |
|--------|-------|
| Total | 345 |
| Pass / fail | 335 / 10 |
| vs `origin/main` | fail count **10** both; **branch-only 0** |

## CI run (authoritative)

| Field | Value |
|-------|-------|
| Run | https://github.com/UltronService/milksha-demo/actions/runs/39190907549 |
| Workflow conclusion | **failure** (expected: known e2e debt) |
| `unit` job | **success** |
| Cancelled duplicate | https://github.com/UltronService/milksha-demo/actions/runs/39190895616 |

### E2E vs main 38-failure baseline

Baseline source: `artifacts/ci-nightly/main-baseline-failures-39105020723.txt` (36 + addendum 2 = **38** unique tests from main run 39105020723).

| Normalized failing test (PR run 39190907549) | In main 38 baseline? |
|---------------------------------------------|----------------------|
| `board-cell-peak-simulation.spec.mjs` › 3-min peak run… | yes |
| `cloud-qa-checklist.spec.mjs` › network cable pull and restore… | yes |
| `cloud-remote-send.spec.mjs` › ten sends produce ten numbers… | yes (addendum) |
| `controller-post-send-board-read-abort.spec.mjs` › push_numbers HTTP 500… | yes |
| `controller-source-quick-send.spec.mjs` › local quick send… | yes |
| `controller-store-picker-evidence.spec.mjs` › 3c two minutes… | yes |
| `controller-store-picker.spec.mjs` › new store appears within poll window… | yes (line no. shifted on branch after new tests; same title) |
| `forbidden-store-then-qa-isolation.spec.mjs` › zz-deny-test 連線暫停… | yes |
| `fresh-browser-pause-heartbeat.spec.mjs` › boxHeartbeat 403… | yes |
| `home-board-art-alignment.spec.mjs` › landscape art grid @ 1920 | yes |
| `home-board-art-alignment.spec.mjs` › landscape art grid @ 3840 | yes |
| `home-board-cloud-recovery.spec.mjs` › B-N07: 60s blocked routes… | yes |
| `home-board-quick-send-one.spec.mjs` › ten quick sends… | yes |
| `home-board-stale-storage.spec.mjs` › stale cloud settings… | yes |
| `home-board-ten-send-clear.spec.mjs` › local-link fresh context… | yes |
| `home-board-ten-send-clear.spec.mjs` › localStorage seeded 5ab3c35-style… | yes |
| `home-board-ten-send-clear.spec.mjs` › localStorage seeded 8138a4a-style… | yes |
| `pr23-login-count.spec.mjs` › 5 min normal board idle | yes (addendum) |

| Summary | Count |
|---------|-------|
| Unique normalized failures on PR CI | **18** |
| Subset of main 38 baseline | **18 / 18** |
| **Branch-only failures** | **0** |
| Baseline tests that passed on this PR run (flaky green) | 20 |

New store-id E2E on branch (`a17 pairs…`, `a17 appears…`, `a123 invalid…`) ran in passing shards (not in failure list above).

## Files touched (summary)

- Shared: `scripts/store-id-lib.mjs`, `js/shared/store-id.js`
- Controller: `controller/store-list.js`, `controller/controller-app.js`
- Board: `js/board/board-auto-pair.js`, `js/board/board-auto-pair-host.js`, `js/receiver/cloud-boot.js`
- Fake cloud: `tools/fake-cloud/server.mjs`
- Asset bump: `config/asset-version.json` → `20261019a`
