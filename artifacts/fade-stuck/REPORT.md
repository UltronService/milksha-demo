# Ready fade stuck — fix report (PR #44)

**Branch:** `cursor/fix-ready-fade-stuck`  
**Fix SHA:** `770d618` (product); tip `9b593b7` (+ interval script)  
**Store:** `zz-qa-ci-store` only (never `zz-qa-store-a`)

## Root cause (plain words)

When a new ready number arrives, older chips **move to a new grid slot** and run a **ready pulse** (fade from opacity 0 + 1.3× scale). The next update **cancels** that Web Animations pulse (FLIP translate or a new `syncZone` generation) but **`oncancel` / invalidated `onfinish` did not snap opacity back to 1**, so inline style stayed **`opacity: 0`**. Reconcile also **fade-out removed chips that were only moving** (`diff.moved`), recreating them at opacity 0 again. Live cloud **multiple `applyPayload` per send** made this show up constantly; QA desktop repro matched (newest opaque, four stuck at 0).

**Hypothesis confirmed:** pulse interrupt + moved-chip fade-out/rebuild without snap (not headless throttling).

## Code changes (minimal)

File: `js/board/milksha-board-anim.js`

- `animateOpacity` / `animateReadyPulse`: on **cancel** and on **generation-invalidated finish**, **snap** to target opacity (ready pulse → opacity **1**, transform cleared).
- `syncZone` reconcile: **do not** `scheduleChipFadeOutRemove` for chips whose id is in **`diff.moved`** (including stray slots when inserting the new chip).

#36 pulse timing/scale unchanged.

## Red → green (regression)

| Check | Before (`main` / pre-fix) | After (fix SHA) |
|-------|-------------------------|-----------------|
| Unit `board-ready-fade-regression.test.js` | **3 fail** | **3 pass** |
| E2E pulse cancel | **fail** (`0` vs `1`) | **pass** |
| E2E forced cancel + multi-apply burst | N/A | **pass** |
| Full unit `npm test` | 195 pass, 1 fail (regression) | **196 pass** |

**Multi-apply e2e on raw headless timing alone did not fail on pre-fix `main`**. Deterministic proof: **unit syncZone slide**, **WAAPI pulse-cancel e2e**, and **forced cancel during burst** (added in `board-ready-fade-multi-apply.spec.mjs`).

## Live matrix (branch board JS via `installGithubPagesSiteRoute`)

Command:

```bash
LIVE_CLOUD_STORE_ID=zz-qa-ci-store node scripts/fade-stuck-interval-matrix.mjs --mode live --gaps 1000,5000 --rounds 1
```

| Gap | Pre-fix (investigation, 3 rounds) | Post-fix (branch, 1 round/gap) |
|-----|-------------------------------------|--------------------------------|
| 1000 ms | **3/3** stuck (4× transparent @ 45s) | **0/1** stuck (`stuckNotAllOpaqueAt45s`) |
| 5000 ms | **3/3** stuck | **0/1** stuck |

Teardown: `teardownLiveCloudSession` (stop simulation + `clear_now`).  
Note: `--rounds 3` hit intermittent **clear board** timeouts on a dirty store; **0 transparent @ 45s** observed on successful rounds with fix.

Raw: `artifacts/fade-stuck/interval-matrix-live-1791680868182.json`, log `interval-matrix-live-fix3.log`.

## Local verification

```bash
npm test                                    # 196 pass
npx playwright test tests/e2e/board-ready-fade-pulse-cancel.spec.mjs \
  tests/e2e/board-ready-fade-multi-apply.spec.mjs \
  tests/e2e/board-cell-peak-simulation.spec.mjs
```

#39 integrity: `board-cell-peak-simulation.spec.mjs` **pass** (3-min peak + smoke).

Full local `npx playwright test tests/e2e`: **191 passed**, 3 failed (`guest-clock.spec.mjs` ring overlay geometry — unrelated to anim fix), 4 skipped (~41m).

## CI

- **Green:** https://github.com/UltronService/milksha-demo/actions/runs/38102946004 (`54e9bd9`)

## Next (not in #44)

Investigate live **~5× `applyPayload` per send** → `cursor/multi-apply-debug` / `artifacts/multi-apply/HYPOTHESES.md`.
