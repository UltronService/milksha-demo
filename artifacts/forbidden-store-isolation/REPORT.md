# forbidden-store-then-qa-isolation — read-only diagnosis

**Scope:** PR #108 @ `a0209b4`, CI run `39283421869` vs main `39136354686`. No code/deploy/CI changes in this note.

## CI symptom (branch-only)

| Run | Head | Result for this spec |
| --- | --- | --- |
| `39283421869` | `a0209b4` | **Fail** — `expect([data-testid="btn-send-numbers"]).toBeEnabled` timeout **60s** (shard e2e 17), at `waitControllerOutboundReady` → line **67** (`ctrlB`) |
| `39278656213` | `d2af9ec` (same e2e/product as `a0209b4` aside from docs) | **Pass** |
| `39136354686` | main | This spec **not** in failed set (main can still fail it on other shards / nights — see `artifacts/ci-nightly/main-baseline-failures-39105020723.txt`) |

**Branch-only:** 1 — only #108’s modified spec + stricter wait fails while main’s looser wait often does not surface the same assertion.

---

## (1) Test-file diff `fb8d162` → `a0209b4` (+15 / −2)

| Change | Effect on timing / flow |
| --- | --- |
| `waitControllerOutboundReady()` | After `#online-state[data-connected="1"]` (60s), also requires **`btn-send-numbers` enabled** (60s). Main only waited `data-connected="1"` (30s) then clicked. **Connected ≠ outbound-ready** in cloud mode (`boardReadyForOutboundSend()` needs board heartbeat / no `boardLinkHint`). |
| Post–`zz-deny` **storage wipe** | New tab → `GET /` (no `store`) → `localStorage` + `sessionStorage` clear → close. On #108, `/` shows setup gate (no cloud boot on that tab). **Does not change** URLs for board/controller tabs (`?mode=cloud&store=zz-qa-store-a|b`). |
| `boardB` `#milksha-cloud-paused` hidden | Extra 30s assert; unrelated to send button. |
| Store IDs | **Unchanged** — still `zz-deny-test`, `zz-qa-store-a`, `zz-qa-store-b`. |

**Conclusion (1):** #108 **changes what the test waits on** (stricter, longer) and adds wipe + pause checks. It does **not** point at different stores. The CI failure is exactly the **new** `toBeEnabled` gate, typically on **ctrlB** under parallel tab load.

---

## (2) Product / send-button logic (#108 vs main)

| Area | main `fb8d162` | #108 `a0209b4` | Could disable send for `zz-qa-store-a/b`? |
| --- | --- | --- | --- |
| `controller/controller-app.js` | — | **No diff** | No |
| `getActionBlockReason` / `boardReadyForOutboundSend` | unchanged | unchanged | Disabled when connected but **「等待看板連線…」** / `boardLinkHint` — race, not store-id |
| `controller/store-list.js` | Inline regex + `KNOWN_LITERAL` (`s120030`, `c030020`, `a17`) | Delegates to `QMS.StoreId.isValidStoreIdFormat` | **`zz-qa-*` still valid**; literals removed from validator but not used in this spec |
| `js/store-id.js` | absent on home | new module | Accepts `zz-qa-*`, `zz-deny-*`, `[a-z][0-9]{2}`, `[a-z][0-9]{6}` |
| `js/receiver/home-board-store.js` + `app.js` / `cloud-boot.js` | default `c030020` when no store | setup gate when store missing/invalid | Controllers use **`/controller/?mode=cloud&store=zz-qa-…`** — **not** gated by home setup screen |
| Wipe tab `GET /` | N/A | setup UI only | Does not set `storeAccessBlocked` on controller tabs |

**Conclusion (2):** No evidence that #108 store-id / setup screen **incorrectly blocks** `zz-qa-store-a/b` on controller URLs. Failures match **outbound-ready race** (button disabled while `data-connected="1"` can already be true). #108 home-board changes are **orthogonal** to this spec’s controller paths.

---

## Local runs (fake-cloud, `forbidden-store-then-qa-isolation.spec.mjs` only)

Environment: single agent VM, sequential runs, same harness as CI.

### `a0209b4` (#108) — 6 runs

| Run | Outcome | Failure mode (if any) |
| --- | --- | --- |
| 1 | pass | — |
| 2 | pass | — |
| 3 | fail | (first batch; detail not captured) |
| 4 | fail | `toBeEnabled` `btn-send-numbers` 60s |
| 5 | fail | `toBeEnabled` `btn-send-numbers` 60s |
| 6 | pass | — |

**Aggregate:** **3 / 6 pass** (~50% flake on #108 spec).

### `fb8d162` (main) — 3 runs (full tree checkout)

| Run | Outcome |
| --- | --- |
| 1–3 | **pass** |

**Aggregate:** **3 / 3 pass** on this VM (user-reported **1 / 3** on main elsewhere → main is **flaky under load**, but **less often** with old waits).

---

## Verdict

| Hypothesis | Assessment |
| --- | --- |
| **Caused by #108 product regression** (store-id / setup gate blocks QA stores) | **Unlikely** — controller logic unchanged; `zz-qa-*` valid; failure is disabled send with existing cloud **board-link** gating. |
| **Pre-existing flake on main** | **Yes** — spec listed in main CI baseline artifacts; PR #95 also hits it; main local pass rate &gt; #108 on same VM. |
| **Caused by #108 test-file change** | **Yes (primary for branch-only)** — `waitControllerOutboundReady` + 60s `toBeEnabled` turns a latent **connected-before-outbound-ready** race into a **branch-only** failure when CI is slower or sharded (`39283421869` vs passing `39278656213` on same code path). |

**One-line:** Branch-only failure is **mostly the #108 spec tightening** exposing **pre-existing controller/board timing flake**, not a new store-id mis-validation for `zz-qa-store-a/b`.

---

## References

- Spec: `tests/e2e/forbidden-store-then-qa-isolation.spec.mjs`
- Controller disable rules: `controller/controller-app.js` (`getActionBlockReason`, `boardReadyForOutboundSend`)
- Related passing pattern (isolated contexts): `tests/e2e/home-board-per-store-isolation.spec.mjs`

**Diagnosis date (UTC):** 2026-10-19
