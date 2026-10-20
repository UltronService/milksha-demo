# Board sound v2 — chime policy

## Result

**PASS** — 15/15 v2 acceptance unit cases green; `npm test` 352/352; chime e2e (controller-actions + main baseline) green on Chromium.

## PR

https://github.com/UltronService/milksha-demo/pull/109

## Red (before `chime-policy.js` change)

Command: `node --test tests/board-sound-v2-acceptance.test.js` with `main` chime policy.

| # | Case | Red |
|---|------|-----|
| 1 | prep → ready | FAIL (same-day dedupe after first ring) |
| 2 | direct ready | FAIL |
| 3 | leave / re-enter | FAIL |
| 4 | same number twice / day | FAIL |
| 5 | store + udd same digits | FAIL |
| 6 | unchanged ready resend | FAIL (assertion harness; policy OK) |
| 7 | first payload silent | **PASS** |
| 8 | max 3 / payload | **PASS** (`splitPopQueue`, unchanged) |
| 9 | sound off | **PASS** |
| 10 | queue no overlap | **PASS** (`ring-queue.js`, unchanged) |
| 11 | no date dependency | FAIL (dedupe key used business date) |
| 12 | midnight steady / re-enter | FAIL |
| 13 | all existing unit tests | see green below |
| 14 | realtime ↔ polling resend | FAIL (same-day dedupe; weak harness) |
| 15 | 24h / 1000 occupancy | FAIL (no `getReadyOccupancyCount`) |
| 16 | clear then full list | FAIL (no `onBoardCleared`) |

**Why only 7–10 passed:** first-batch silence, 3-cap, mute, and FIFO queue live outside same-day dedupe; the rest required removing per-day number dedupe and clear-board baseline reset.

## Green (after change)

```
node --test tests/board-sound-v2-acceptance.test.js → 15/15 pass
node --test tests/chime-policy.test.js → 6/6 pass
npm test → 352/352 pass
npx playwright test tests/e2e/controller-actions.spec.mjs --grep "chime|rechime" → 3/3
npx playwright test tests/e2e/main-5501-local-baseline.spec.mjs → 1/1
```

## Code

- `js/receiver/chime-policy.js` — ring only on newly entering ready set; prune occupancy; `onBoardCleared()`.
- `js/receiver/cloud-runtime.js` — call `onBoardCleared()` on guest clear.
- Asset bump `20261019a` (`config/asset-version.json` + HTML `?v=`).

## Acceptance detail: #14 (transport mode switch)

**Result: PASS** (`v2-14` in `tests/board-sound-v2-acceptance.test.js`)

**What the test does:** After boot-silent baseline, models **realtime** establishing `store:1001` + `store:1002` on 請取餐 (two chimes). `prevReady` is then fixed to that set. Three consecutive **full-list resends** of the same two ids model **2s polling**, then **back to realtime**—each resend calls `pickRingIds(prev, ready)` with `prev === ready`. **Expectation:** zero ring ids every time. Only when `store:1003` is added does one chime fire.

## Acceptance detail: #15 (memory prune / long run)

**Result: PASS** (`v2-15` in `tests/board-sound-v2-acceptance.test.js`)

**What the test does:** Simulates **24 batches** (24h-style ticks; business date rolls at batch 24→`2026-10-03`). Each batch starts with a **full ready-list resend** (no chime), then processes enter/leave events. **1,000** distinct ids used in order `store:0000` … `store:0999` (cycled by touch index). Ready window capped at **8** concurrent numbers (leave oldest when exceeded).

| Metric | Value |
|--------|-------|
| `getReadyOccupancyCount()` at start | **0** |
| After 24 batches + 1,000 number touches | **≤ 8** (equals current ready set size) |
| Max occupancy during run | **≤ 8** (bounded) |
| Batch count | **24** |
| Numbers touched | **1,000** (`store:0000`–`store:0999` cycle) |

Record holds only ids still in the current 請取餐 set at end; no unbounded growth across the simulated day.

## Manual UAT (zz-qa-* only)

1. Open board on a `zz-qa-*` store; send one number to 請取餐 → one chime after first silent sync.
2. Remove that number from 請取餐, send again → chimes again (same day).
3. Send four new numbers in one payload → only three chimes.
4. 清空看板 → resend same numbers → chimes again (≤3 per payload).
