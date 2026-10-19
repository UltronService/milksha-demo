# Number display spec v2 — PR #95

| Field | Value |
| --- | --- |
| **head sha** | _(pending push)_ |
| **asset version** | `20261019d` |
| **branch** | `cursor/controller-default-number-5dd5` |

## QA remediation mapping (bc-4b0b3f25)

| QA item | Fix | Test |
| --- | --- | --- |
| E2E still expects format red-text (redesign ~:73) | `controller-redesign-acceptance.spec.mjs` → v2 short send, no `is-error` | E2E pass |
| E2E still expects format red-text (source-quick-send ~:35) | `controller-source-quick-send.spec.mjs` → `abc` sends + board cell | E2E pass |
| Cancel/removal id must use trimmed original | `board-seq.js` + pickup scan `boardDedupeKeyFromRaw` | `board-seq-number-v2.test.js`, `number-spec-v2` wiring |
| Cloud 64-char cap vs board 6-char display | `boardNumberFromPos` clamps dedupe to 64 code points | `number-spec-v2.test.js` cloud alignment |
| Empty cell same size as normal | `.milksha-num { min-height: 1em }` | `board-number-rules.spec.mjs` bounding box |

## Spec coverage (15 items)

| # | Requirement | Test | Result |
| --- | --- | --- | --- |
| 1–15 | (unchanged) | `tests/number-spec-v2.test.js` | pass |
| 2b | STB code-point baseline + Segmenter fallback | `number-spec-v2.test.js` STB tests | pass |

## STB / old WebView truncation

- Baseline: `truncateToDisplayUnitsByCodePoint` (`Array.from` + slice).
- Optional: `Intl.Segmenter` when available.

## Unit tests

- **376** pass (`npm test`)

## E2E (local, QA-related)

- `controller-redesign-acceptance.spec.mjs` (v2 short number)
- `controller-source-quick-send.spec.mjs` (v2 abc send)
- `board-number-rules.spec.mjs` (empty cell height)

## Evidence

- Mock: `screenshots/board-number-spec-v2-1920.png`
- Live dev (`zz-qa-store-a` only): `live-zz-qa-store-a-report.json`, `screenshots/live-zz-qa-store-a-number-spec-v2-1920.png`

## CI

| Run id | Branch-only failures |
| --- | --- |
| _(pending after push)_ | target **0** |
