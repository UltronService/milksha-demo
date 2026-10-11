# Ready fade regression tests

Branch: `cursor/fix-ready-fade-stuck`

## Before fix (`main`)

- Unit `board-ready-fade-regression.test.js`: **3/3 fail** (`'0' !== '1'`).
- E2E `board-ready-fade-pulse-cancel.spec.mjs`: **fail** (inline opacity `0` after WAAPI cancel).

## After fix

- Unit: **3/3 pass**
- E2E pulse-cancel + multi-apply (incl. **forced cancel** case): **pass**
- Multi-apply full-board burst: headless timing alone did **not** fail on pre-fix `main`; **forced WAAPI cancel** + unit syncZone cover the bug deterministically.

## Commands

```bash
node --test tests/board-ready-fade-regression.test.js
npx playwright test tests/e2e/board-ready-fade-pulse-cancel.spec.mjs tests/e2e/board-ready-fade-multi-apply.spec.mjs
```
