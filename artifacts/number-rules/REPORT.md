# fix(board): 16:55 number display rules — REPORT

## Scope

Second-line board guard at `partitionNumberContent` / `normalizeBoardDisplayNumber`:

- Only render `/^\d{4}$/` values; drop invalid entries with `console.warn` once per distinct bad value.
- Dedupe within ready / within preparing; same number in both lists → **ready only**.
- Payloads with **>50** valid entries still partition/render (push validation remains on simulator/backend).

## Simulator (#39 baseline + tests)

- `validateTicketsForBoardPush` unchanged; added **10k-step** reconcile test (four-digit, disjoint prep/ready, no duplicate nos).
- Wrap **9999 → 0001** covered via `wrapOrderCounter` + `allocateNextNumber`.

## Tests

| Layer | Coverage |
|-------|----------|
| Unit | `tests/board-number-rules.test.js`, extended `controller-store-simulation.test.js`, `board-pos-list` (4-digit) |
| E2e | `tests/e2e/board-number-rules.spec.mjs` (local fake cloud only) |
| Demo script | Non-numeric channel labels → 4-digit equivalents for ring regression |

## Commit / CI

- Branch: `cursor/board-number-rules-a2ca`
- PR: https://github.com/UltronService/milksha-demo/pull/43
- **SHA:** `d6f25fa1d4ddb5df7b4fa9fcae07b030cb594ae7`
- **CI:** https://github.com/UltronService/milksha-demo/actions/runs/38075430530 — **success**
