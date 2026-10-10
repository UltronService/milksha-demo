# Multi-pulse gap measurement (QA medium)

**Branch**: `cursor/board-multi-pulse-gap` (measure-only, no PR)  
**Base board**: `cursor/board-ready-fade-4ad1` @ merge `main` (ready pulse fixed **1.3×**, no safe cap)

## Setup

- Local `?mode=local`, viewports **1920×1080** and **3840×2160**
- Numbers **9990–9999** (widest 4-digit), full ready grid **10 cells**

## Scenarios

| ID | Trigger | Expected pulsing @ hold |
|----|---------|-------------------------|
| `three_at_once` | Silent 9993–9999, then one payload all 10 OK | **3** newest (9990–9992) |
| `ten_at_once` | After silent prime, one payload 10 OK | **10** |
| `two_vertical_adjacent` | 9999+9998 prep, rest OK (silent), then all 10 OK | **2** (9999–9998), left column cells 0–1 |

## Metrics @ hold (~300ms after pulse start)

- **minGapScaledPairPx**: min gap between **expanded** boxes of two chips both at scale ≥ 1.15
- **minGapScaledToStaticPx**: min gap pulsing expanded → non-pulsing chip base rect
- **minGapToZoneEdgePx**: min distance expanded box → `.milksha-zone.ready` border
- **overlaps**: any AABB overlap (scaled uses expanded; static uses layout rect)

## Run

```bash
node scripts/board-multi-pulse-gap-measure.mjs
```

Output: `artifacts/board-multi-pulse-gap/multi-pulse-gap-report.json`
