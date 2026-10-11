# PR #46 public retest — `4146812` / asset `20261011b`

**Verdict: PASS** (store `zz-qa-store-a` only; no route overrides; no manual refresh)

## Deploy
- GitHub Pages deploy for `4146812` confirmed (`index.html` Last-Modified `Sun, 11 Oct 2026 10:30:50 GMT`); harness waited deploy + 10 minutes before testing (`deploy-confirm.json`).

## Stale-cache (profile `artifacts/pr46live/profile-old`, baseline `20261011a`)
- **PASS**: After normal navigation to public board + controller, **67** local js/css resources all carried `?v=20261011b`; **0** `20261011a` or older (`stale-cache-reopen.json`).
- `transferSize`: mix of **0** (disk cache) and **non-zero** revalidations (e.g. board CSS `2225`, `milksha-board-anim.js` `8488`); all versions correct.

## Column-move animation (1920×1080 persistent, then 3840×2160 fresh)
- **PASS** transitions **5→6 … 9→10** in **prep** and **ready**: tracked slot-4 number had **no horizontal drift** while visible, **downward** motion first; integrity **0** multi/duplicate/order issues; **0** transparent in-cell chips after settle.
- **PASS** ready pulse: newest ready (`8011`) reached **scale 1.3** (>1.25) on both profiles.

## Peak simulation (fresh 4K, 5 min @ 1 Hz)
- **PASS**: **300** samples, **0** integrity flags; **60 s** quiet — simulation send count unchanged (`quietOk: true`).

## Regression
- **PASS** page indicator bottom-right (16/16 design insets on prep + ready **2/2** while board holds 11+11 tickets at 4K).
- **PASS** 選擇門市 / store list (`fld-store` options present).
- **PASS** latency: **0** sends **>3 s** (`latOver3: []`).

## Teardown
- **PASS**: `clear_now` — board empty.

## Artifacts
- `results.json`, `stale-cache-reopen.json`, `deploy-confirm.json`, `screenshots/`, `run.log`, `run-console.log`
- Copied to `/cursor/stores/self/artifacts/pr46live/` (excluding `profile-old`).

## Harness note
- Initial full run marked overall FAIL because page-indicator was checked **after** peak sim (single-page / no indicator DOM). Regression re-measured **after column-fill, before peak**; `run-public-pr46live.mjs` updated to match that order for future runs.
