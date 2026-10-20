# Full `npm test` — 3× stability (head after `964b237`)

Recorded 2026-10-20 on cloud agent VM.

## PR `cursor/pos-time-sort`

| Run | tests | pass | fail |
|-----|------:|-----:|-----:|
| 1 | 375 | 365 | 10 |
| 2 | 375 | 365 | 10 |
| 3 | 375 | 365 | 10 |

**Failures (same 10 every run):**

1. `widest compliant stress payload stays inside cream bands @ 70px`
2. `BOARD_LAYOUT_HARNESS_QUERY uses local mode without cloud auto-pair default`
3. `layout harness URL keeps board surface off cloud auto-pair boot`
4. `PR #74: same column number and icon-box left edges within 1px`
5. `PR #74: chip, number, and icon box stay inside cream column bands`
6. `PR #74: icon slot and number left match 70px preview anchors`
7. `PR #74 widest compliant stress: all chips inside cream bands`
8. `production board @ 1920×1080: 70px Arial Regular, icons, foodpanda #6405`
9. `Milksha ref UI: icon box left edges within 2px @ 1920`
10. `Milksha ref UI: comparison layout widest labels stay inside cream`

## `main`

| Run | tests | pass | fail |
|-----|------:|-----:|-----:|
| 1 | 352 | 342 | 10 |
| 2 | 352 | 342 | 10 |
| 3 | 352 | 342 | 10 |

Same **10** layout/cream-band harness failures (test **indices** differ from PR because PR adds 23 tests).

## QA “3 extra failures on run 1” — analysis

On current head, **no** extra failures across 3 consecutive runs (always 10). The earlier QA spike on `161e92f` was **not reproduced** here.

Likely causes when 13 failures appear (historical / other env):

| Candidate | PR-related? | Root cause |
|-----------|-------------|------------|
| `js/css changes vs origin/main require asset version bump` | Yes (fixed in `f00ebb2`) | Asset version not bumped with `js/board/*` edits |
| `acceptance 8b: whitelist policy…` | Yes (fixed in `0558c4a`) | Whitelist sample out of date after adding board files |
| `spec 1: pos2756-test… board paths` | Yes (fixed in `0558c4a`) | Strict `js/board/` diff guard |
| Playwright harness timeouts | No | Ephemeral port / `copySiteForPlaywright` / no display — same tests as the stable 10 |

**Conclusion:** No additional fix required for sort PR beyond commits already on branch; remaining 10 failures are **pre-existing layout harness** checks and fail on `main` equally. QA laptops with 0–1 `main` failures likely run harness in an environment where Playwright layout probes pass.
