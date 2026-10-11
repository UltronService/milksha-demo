# Ready fade stuck — regression tests (expected RED on `main`)

Branch: `cursor/fix-ready-fade-stuck`  
Base: `main` @ `f9d0513` (tests only, no product changes).

## What was added

| Test | Kind | Expected on main |
|------|------|------------------|
| `tests/board-ready-fade-regression.test.js` | unit (node:test) | **FAIL** (3 cases) |
| `tests/e2e/board-ready-fade-pulse-cancel.spec.mjs` | Playwright / WAAPI | **FAIL** |
| `tests/e2e/board-ready-fade-multi-apply.spec.mjs` | Playwright / applyPayload burst | passes in headless today; guards fix (live-style 5× apply / 1s × 5 sends) |

AnimConfig default pulse window: `readyScaleInMs + readyScaleHoldMs + readyScaleOutMs` = **3600ms**; multi-apply e2e waits **max(10s, pulse+500ms)** per send after each burst.

## Red output (captured on branch tip)

### Unit — `node --test tests/board-ready-fade-regression.test.js`

```
# tests 3
# pass 0
# fail 3

not ok 1 - animateReadyPulse: cancelled pulse must leave opacity at 1
  '0' !== '1'

not ok 2 - animateReadyPulse: generation-invalidated finish must leave opacity at 1
  '0' !== '1'

not ok 3 - syncZone: second ready before first pulse finishes leaves first chip opaque (live slide pattern)
  '0' !== '1'
```

### E2E — `npx playwright test tests/e2e/board-ready-fade-pulse-cancel.spec.mjs`

```
✘ animateReadyPulse: cancel must leave chip opaque
  Expected: "1"
  Received: "0"
  (inline=0 computed=0)
```

### E2E — multi-apply (informational)

```
✓ five sends 1s apart with 5× applyPayload burst per send → all ready chips opaque
```

Headless Playwright completes WAAPI for full-board applies; **live QA / unit syncZone** remain the authoritative repro. After product fix, all three should go green.

## Commands

```bash
node --test tests/board-ready-fade-regression.test.js
npx playwright test tests/e2e/board-ready-fade-pulse-cancel.spec.mjs tests/e2e/board-ready-fade-multi-apply.spec.mjs
```

## Planned fix (do not implement until owner go)

- Snap opacity on cancel / invalidated finish in `animateReadyPulse` and related opacity anims.
- In `syncZone` reconcile, do not fade-out/rebuild chips in `diff.moved`.
