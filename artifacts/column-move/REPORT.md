# Column-move animation — delivery report

**Branch:** `cursor/column-move-animation-a2ca`  
**Base:** `main` @ `b24cd2d` (includes #43 `f9d0513` newest-first board partition)  
**HEAD:** `6a88b97`  
**PR:** https://github.com/UltronService/milksha-demo/pull/46 (draft)  
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

**Unit:** `tests/column-move-plan.test.js` (`detectColumnMovePlan` sixth-on-page, including newest-first `enterSlot === 0`).

## Implementation notes

- Isolated helpers in `js/board/milksha-board-anim.js`: `detectColumnMovePlan`, `animateColumnMoveSlideDownOut`, `animateColumnMoveEnterFromAbove` (no edits to ready-pulse / fade-in paths).
- Sixth-on-page detection uses **visible count 5→6** (not fixed slot 5) so newest-first prep queues (#43) trigger column-move.
- Exit motion uses **layer clones** so in-cell chips stay intact (#39 one-chip-per-cell).
- Post-move settle runs **only when `columnMovePlan` is active** — avoids clearing ready 1.3× pulse transforms on every sync.
- Config: `columnMoveMs` (default 300) in `milksha-board-anim-config.js` (`animColumnMove` URL param).
- **Stores:** local fake-cloud e2e only; no `zz-qa-store-a`.

## Local verification

```text
npm test → 195 pass
npx playwright test tests/e2e/board-column-move.spec.mjs → 10/10 pass
```

## CI

- Prior failure (opacity / plan on #43 order): https://github.com/UltronService/milksha-demo/actions/runs/38105816755
- Latest run: _(after push on `6a88b97`)_

## Contact sheets

- 1080p: `artifacts/column-move/screenshots/column-move-prep-1080p.png`
- 4K: `artifacts/column-move/screenshots/column-move-prep-4k.png`
