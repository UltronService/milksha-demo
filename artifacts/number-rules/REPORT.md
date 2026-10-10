# fix(board): 16:55 number display rules — REPORT

## Scope

Second-line board guard at `partitionNumberContent` / `normalizeBoardDisplayNumber`:

- Only render `/^\d{4}$/` **strings**; JSON `number` values are dropped (aligned with backend PR #19 — no coercion).
- Drop other invalid entries with `console.warn` once per distinct bad value.
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

## QA fix — strings only (TDD)

**Red (pre-fix on `d6f25fa`):** `node --test tests/board-number-rules.test.js` → **3 failed** — `normalizeBoardDisplayNumber(1001)` expected `null` got `"1001"`; partition dropped string siblings incorrectly when JSON numbers present.

**Green (post-fix):** same suite **6/6 pass**; `board-number-rules.spec.mjs` includes e2e `JSON number 1001 is not displayed`.

## Commit / CI

- Branch: `cursor/board-number-rules-a2ca`
- PR: https://github.com/UltronService/milksha-demo/pull/43
- **SHA:** `6d9fe1a93e14ed66c86c0c7da46c7c97284299a6` (QA strings-only fix `e54abb5`)
- **CI:** https://github.com/UltronService/milksha-demo/actions/runs/38084621347 — **success**
