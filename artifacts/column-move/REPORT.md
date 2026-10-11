# Column-move animation — delivery report

**Branch:** `cursor/column-move-animation-a2ca`  
**Base:** `main` @ `9846953` (#44 ready fade / transparency fix) atop #43 `f9d0513`  
**HEAD:** `5f6f8cd`  
**PR:** https://github.com/UltronService/milksha-demo/pull/46  
**Boundary:** `artifacts/column-move/TEST-BOUNDARY.md` (owner approved 2026-10-11 08:09; item 3 = prep **and** ready)

## TDD summary (boundary order)

| # | Behaviour | Evidence |
|---|-----------|----------|
| 1 | Prep: left column bottom slides down/out on 6th | `tests/e2e/board-column-move.spec.mjs` + exit clone motion samples |
| 2 | Prep: 6th enters right top from above | e2e motion samples via `chipMotionSampleForNumber` |
| 3 | **Prep and ready:** right bottom vacates (page-2 overflow) | e2e tests 3 (both zones) |
| 4–5 | Ready: mirror of 1–2 | e2e tests 4–5 |
| 6 | Transform + opacity only during move window | e2e test 6 |
| 7 | Cell integrity during column move (#39) | `sampleIntegrityDuringUpdate` |
| 8 | Settled numbers match layout queue / `layoutPageGrid` | e2e test 8 + `layoutQueueNumbers` |
| 9–10 | 1080p / 4K contact sheets | `artifacts/column-move/screenshots/column-move-prep-1080p.png`, `column-move-prep-4k.png` |

**Unit:** `tests/column-move-plan.test.js`; **#44 regression:** `tests/board-ready-fade-regression.test.js` (203 tests in `npm test`).

## Implementation notes

- Isolated column-move helpers in `js/board/milksha-board-anim.js` (no edits to `animateReadyPulse` / ready-pulse timing).
- Merged with **#44**: `snapOpacity` on cancel + moved-chip slot reconcile (`movedIdSet`) preserved alongside column-move paths.
- Sixth-on-page: visible count **5→6** (newest-first #43).
- Column-move settle: opacity on hold chips; clear **transform** only on enter-from-above chips (does not reset ready 1.3× pulse on unrelated cells).
- Config: `columnMoveMs` (default 300) in `milksha-board-anim-config.js`.
- **Stores:** local fake-cloud e2e only; no `zz-qa-store-a`.

## Local verification (`5f6f8cd`)

```text
npm test → 203 pass (includes board-ready-fade-regression.test.js)
npx playwright test tests/e2e/board-column-move.spec.mjs → 10/10
npx playwright test tests/e2e/board-ready-fade-multi-apply.spec.mjs tests/e2e/board-ready-fade-pulse-cancel.spec.mjs → pass
npx playwright test tests/e2e/board-cell-peak-simulation.spec.mjs → pass
```

## CI

- **Green:** https://github.com/UltronService/milksha-demo/actions/runs/38112772401 (`5f6f8cd`, full `npm test` + `test:e2e` including live-cloud fade).

## Contact sheets

- 1080p: `artifacts/column-move/screenshots/column-move-prep-1080p.png`
- 4K: `artifacts/column-move/screenshots/column-move-prep-4k.png`
