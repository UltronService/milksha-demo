# Store ID rule — implementation report

**Branch:** `cursor/store-id-rule-de1b`  
**PR:** https://github.com/UltronService/milksha-demo/pull/105  
**Head commit:** `262295a`  
**Asset version:** `20261019a`  
**Date (Taipei):** 2026-10-19

## Rule (owner-approved)

- Valid: `1 letter + 2 digits` (e.g. `a17`, `a00`, `a07`, `x99`) **or** `1 letter + 6 digits` (e.g. `c030020`, `x123456`).
- Reject: letter + 3/4/5/7+ digits; pure digits; multi-letter prefixes.
- Uppercase normalized to lowercase (`A17` → `a17`); no strip/pad (`a17` ≠ `a000017`).
- Display/store id string is full id (e.g. `a17`, never `17`).
- `zz-qa-*` unchanged.

## Scope checklist

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Accept/reject matrix (unit) | **pass** | `tests/store-id.test.js` (6 tests), `tests/store-list.test.js` (format tests), `npm test` |
| 2 | Board `store=a17` pairs on **milksha-qms-dev** | **waiting-on-backend** | `curl` POST `boardAutoPair` with `storeNumber:a17` → `{"ok":false,"information":"找不到目標叫號機"}` (HTTP 200). Fake-cloud E2E: `home-board-auto-pair.spec.mjs` «a17 pairs…» **pass** locally |
| 3 | Controller store list shows `a17` after pair | **pass** (fake cloud) / **waiting-on-backend** (live dev) | E2E `controller-store-picker.spec.mjs` «a17 appears in store list…» **pass**; live listStores not verified until dev registry has `a17` |
| 4 | POS `milkshaa17` / `c030020` front-end unchanged | **pass** | No POS ingest path changes; `validate-request.js` demo store rows unchanged; `c030020` operator picker + existing tests unchanged |
| 5 | `zz-qa-*` still work | **pass** | Unit: `zz-qa-store-a`, `zz-qa-ci-store` in `store-id.test.js`; existing E2E harness stores unchanged |

## Unit tests

- **Total:** 345 (`npm test`)
- **Pass / fail:** 335 / 10
- **vs `origin/main`:** fail count **10** on both (branch-only failures **0**)

Known failing tests on main (unchanged on branch): layout harness / PR#74 visual / `widest compliant stress` (see `npm test` `not ok` lines 52, 267, 269, 273–277, 281, 283).

## E2E (this change)

- `home-board-auto-pair.spec.mjs` — a17 pair + hint
- `controller-store-picker.spec.mjs` — `a123` rejected; `a17` in list after board pair

## CI

- Link: _(filled after push — see PR checks)_
- E2E baseline comparison: expect **38** known failures on `main`; branch-only delta should be **0** (same policy as unit).

## Files touched (summary)

- Shared: `scripts/store-id-lib.mjs`, `js/shared/store-id.js`
- Controller: `controller/store-list.js`, `controller/controller-app.js`
- Board: `js/board/board-auto-pair.js`, `js/board/board-auto-pair-host.js`, `js/receiver/cloud-boot.js`
- Fake cloud: `tools/fake-cloud/server.mjs`
- Asset bump: `config/asset-version.json` → `20261019a`
