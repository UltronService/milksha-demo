# 16:53 column-move animation — test boundary (owner review)

**Status:** Owner approved 2026-10-11 08:09 (Taipei); TDD in progress on `cursor/column-move-animation-a2ca`.  
**Process:** TDD red→green; one failing test → minimum code → one vertical slice; public behaviour only; mocks only at system boundaries; refactor later.  
**Note:** `.cursor/skills/tdd/SKILL.md` is not present in this repo at branch creation time.

## Public test surface (no private anim internals)

| Layer | Interface | How tests observe behaviour |
|-------|-----------|-----------------------------|
| **Primary** | Local fake-cloud **e2e** (`urlsLocalHomePoc`, `applyPayload`) | Real browser DOM: `.milksha-zone.prep` / `.milksha-ready`, `.milksha-num-cell`, `.milksha-board-chip` |
| **Motion** | DOM geometry + CSS | Repeated `getBoundingClientRect()`, `getComputedStyle()` → `transform`, `opacity` (and transition when reduced-motion) |
| **Integrity (#39)** | Existing helpers | `tests/e2e/board-animation-helpers.mjs` → `getBoardIntegritySnapshot` / sampling during animation windows |
| **Timing** | Configurable durations | Read `window.QMS.Board.AnimConfig` (or rendered timing) only to bound wait windows — not to assert private easing curves |
| **Regression visuals** | Contact sheets | Playwright screenshots at **1080p** and **4K** viewports, committed under e2e artifacts path (same pattern as other board animation sheets) |

**Out of scope for unit tests:** `syncZone` internals, private slot maps, Firebase, `zz-qa-store-a` (fake cloud / local POC only).

**System boundaries where mocking is allowed:** Playwright clock/`waitForTimeout` only; no mock of board animator modules in unit tests for this feature.

## Ordered behaviour spec (≤10 tests)

Implementation order follows this list (one vertical slice per cycle after owner **go**):

1. **`prep: left column bottom chip slides down and out when a 6th number arrives on the current page`**
2. **`prep: 6th number enters right column top from directly above while existing right-column chips slide down one cell together`**
3. **`prep and ready: when the right column bottom must vacate (overflow to page 2), that chip slides down and out before the new layout holds`**
4. **`ready: left column bottom chip slides down and out when a 6th number arrives on the current page`**
5. **`ready: 6th number enters right column top from directly above while existing right-column chips slide down one cell together`**
6. **`prep and ready: column move uses transform and opacity only (no disallowed layout properties on chips during the move window)`**
7. **`prep and ready: during column-move sampling, cell integrity never shows more than one in-cell chip per grid cell`**
8. **`prep and ready: after animation settles, displayed numbers match layoutPageGrid slot order for the active page`**
9. **`1080p contact sheet: mid column-move frame shows expected vertical motion (prep zone reference case)`**
10. **`4K contact sheet: mid column-move frame shows expected vertical motion (prep zone reference case)`**

## Non-goals for this boundary doc

- No production code changes until owner approves this boundary and sends **go**.
- No duplicate of #43 concat / page-turn cross-fade specs unless needed for regression guard (integrity tests only).
