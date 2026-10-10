# Multi-pulse gap report (measure-only)

- **Board base**: `1c700f2f9fafcbffbb5f5d306746a1bcd1a9005a` (PR #36 merge `main` into `cursor/board-ready-fade-4ad1`)
- **PR #36 merge CI**: https://github.com/UltronService/milksha-demo/actions/runs/38012116325 — **success**（e2e 182 passed, 1 skipped）
- **Data**: `multi-pulse-gap-report.json`

## Summary @ hold (1.3×)

| Viewport | Scenario | Pulsing | min gap scaled↔scaled | min gap scaled↔static | min gap → zone edge | Overlaps |
|----------|----------|---------|------------------------|------------------------|---------------------|----------|
| 1080 | 3 at once | 9990–9992 | **5.1 px** | 17.3 | 166.8 | **false** |
| 1080 | 10 at once | all 10 | **5.1 px** (e.g. 9999↔9998) | — | 147.3 | **false** |
| 1080 | 2 vertical (9999+9998) | 2 | **5.1 px** | 17.3 | 166.8 | **false** |
| 4K | 3 at once | 9990–9992 | **336.3 px** | 87.2 | 347.2 | **false** |
| 4K | 10 at once | all 10 | **115.5 px** (same-column pairs) | — | 347.2 | **false** |
| 4K | 2 vertical (9999+9998) | 2 | **115.5 px** | 87.2 | 455.2 | **false** |

Tightest scaled pair on **1080** is **5.1 px** (vertical neighbours in left column, both @ 1.3×). No AABB overlap in any case.
