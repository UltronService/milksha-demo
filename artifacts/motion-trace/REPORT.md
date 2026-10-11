# Board motion trace report

## QA item → test → red/green

| QA # | Requirement | Test | Status |
|------|-------------|------|--------|
| 1 | Merge main (#53) + additive trace hooks | `board-page-turn-desync.test.js`, manual merge | green |
| 2 | Sample ≤50ms for whole motion; 0 frames = INVALID | `milksha-board-motion-trace.test.js` (50ms + validateSession), e2e pickup/clear frame count | green |
| 3 | scale, role, live cream/title rects per frame | `milksha-board-motion-trace.test.js` (chip fields), e2e frame chips | green |
| 4 | Diagonal ignores 1.3× pulse (translate only) | `milksha-board-motion-trace.test.js` diagonal scale-only | green |
| 5 | Ready-zone scenarios all motions | `board-motion-trace.spec.mjs` ready describe | green |
| 6 | column-move/backfill failures include rule/chip/frame/px | e2e analyze `failures[]` + analyzeFrames | green |
| 7 | Bounded memory (ring buffer) | `milksha-board-motion-trace.test.js` ring buffer | green |

## Enable

- `/?mode=local&motionTrace=1`
- or `window.__MILKSHA_MOTION_TRACE = 1` before board scripts load

## Helper API

```js
window.__milkshaMotionTrace.get();
window.__milkshaMotionTrace.clear();
window.__milkshaMotionTrace.validateSession(session); // { valid, reason? }
window.__milkshaMotionTrace.analyzeSession(session);
```

Chip fields: `number`, `itemId`, `zone`, `slot`, `rect`, `opacity`, `scale`, `tx`, `ty`, `role` (`in-cell` | `fading-out` | `float-layer` | `exit-clone`).

Each frame includes `zoneRects.prep|ready.cream|title` measured from DOM at sample time.

Analyze rules (tolerance 0 on translate overlap): `outsideCream`, `coversTitle`, `overlap`, `diagonalMotion`. `column-move` / `backfill` populate detailed `failures[]`.

Config: 50ms sample interval, max 480 frames/session, max 32 sessions.

Regenerate 1080p/4K tables: `node scripts/motion-trace-report.mjs`.
