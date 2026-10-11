# Column-move animation — delivery report

**Branch:** `cursor/column-move-animation-a2ca`  
**Base:** `main` @ `9846953` (#44) + CI concurrency split from `origin/main`  
**HEAD:** `66e04ef`  
**PR:** https://github.com/UltronService/milksha-demo/pull/46 (ready for review)  
**Boundary:** `artifacts/column-move/TEST-BOUNDARY.md` (owner approved 2026-10-11 08:09; item 3 = prep **and** ready)

## TDD summary (boundary order)

| # | Behaviour | Evidence |
|---|-----------|----------|
| 1 | Prep: left column bottom slides down/out on 6th | `tests/e2e/board-column-move.spec.mjs` |
| 2 | Prep: 6th enters right top from above | e2e + `chipMotionSampleForNumber` |
| 3 | **Prep and ready:** right bottom vacates (page-2 overflow) | e2e test 3 |
| 4–5 | Ready: mirror of 1–2 | e2e tests 4–5 |
| 6 | Transform + opacity only during move window | e2e test 6 |
| 7 | Cell integrity during column move (#39) | integrity sampling |
| 8 | Settled numbers match layout | e2e test 8 |
| 9–10 | 1080p / 4K contact sheets | `artifacts/column-move/screenshots/` |

**Unit:** `tests/column-move-plan.test.js`; **#44:** `tests/board-ready-fade-regression.test.js`, `board-ready-fade-*.spec.mjs`.

## Merge / coexistence with #44

- `git merge origin/main` @ `9846953`: auto-merge kept **#44** (`snapOpacity` on cancel, `movedIdSet` slot reconcile) and column-move helpers.
- Column-move hold/settle uses `ensureVisibleOpacity` so sibling **ready pulse WAAPI** is not cancelled during column-move (#44 regression safe).

## Local verification (`26d2b91`)

```text
npm test → 203 pass
column-move + board-ready-fade-* + full board-ready-scale-overlap-grid → pass
board-cell-peak-simulation → pass (see prior run in session)
```

## CI

- **Green (split workflow, both jobs):** https://github.com/UltronService/milksha-demo/actions/runs/38119632474 — `66e04ef` (`npm test`, 207 non–live-cloud e2e, live-cloud fade + simulation).

## Contact sheets

- 1080p: `artifacts/column-move/screenshots/column-move-prep-1080p.png`
- 4K: `artifacts/column-move/screenshots/column-move-prep-4k.png`
