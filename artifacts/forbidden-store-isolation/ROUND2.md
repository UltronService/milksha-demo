# ROUND2 — `forbidden-store-then-qa-isolation`

**Branch:** `cursor/store-setup-screen-0c9f` (PR #108)  
**Director gate:** Pass only if **all four** QA criteria below are met. **No merge / no deploy.**  
**Report (Taipei):** 2026-10-20 07:47 CST (before 08:20 deadline)  
**Pushed spec baseline:** commit after this doc (ROUND2 stabilization + artifacts); prior remote spec for this file: `d2af9ec` @ `a0209b4`.

---

## QA pass criteria (4)

| # | Criterion | Result |
| --- | --- | --- |
| 1 | **Local branch spec** `6/6` **and** **CI green** on PR | **FAIL** — branch batch **0/6** (pre-helper-fix run); CI **not re-validated** on this push at report time (see § CI). |
| 2 | **Main** spec **one batch ×6** recorded here | **FAIL** for stability — **1/6** pass (§ Main batch). |
| 3 | Wait only for **real** board heartbeat (`boxHeartbeat` HTTP **200**); **no** timeout increases; **no** removed assertions/steps | **Met in pushed spec** — `waitForRealBoardBoxHeartbeat` + unchanged `toBeEnabled` **60s** / send + isolation asserts (§ Spec). |
| 4 | After **reordered** page opens, still verifies **original send flow** | **Met in pushed spec** — deny → wipe → boards → ctrlA send → B isolation → ctrlB send (§ Spec). |

**Overall QA pass:** **No** (criteria 1 and 2).

---

## Spec summary (pushed ROUND2)

**File:** `tests/e2e/forbidden-store-then-qa-isolation.spec.mjs` (vs `origin/main` @ `fb8d162`).

| Area | main | ROUND2 (pushed) |
| --- | --- | --- |
| After `zz-deny-test` | — | Storage wipe tab (`GET /` + `localStorage` / `sessionStorage` clear) |
| Page open order | boards + controllers together | deny → wipe → **boards first** → heartbeats → **ctrlA** → **ctrlB** after A send |
| Outbound ready | `data-connected="1"` **30s** only; click may hang on disabled button | `waitControllerOutboundReady`: `data-connected` **60s**, block-reason hidden **60s**, `btn-send-numbers` **toBeEnabled 60s** (both controllers) |
| Heartbeat | implicit / periodic | `waitForRealBoardBoxHeartbeat`: wait until `receiverCloud.sendHeartbeat` exists, `waitForResponse(boxHeartbeat 200, 30s)`, trigger `sendHeartbeat()` |
| Send flow | send A → B count 0 → send B → B visible | **Same assertions** (A visible, B count **0** **10s**, B visible **45s**) |

**Heartbeat helper note:** First branch batch (below) failed with `receiverCloud heartbeat API unavailable` because `Boolean(window.receiverCloud)` could pass before `sendHeartbeat` was bound. Pushed spec waits for `typeof receiverCloud.sendHeartbeat === 'function'` before triggering heartbeat.

---

## Branch ROUND2 batch (one batch, no rerun)

**Command:** `npx playwright test tests/e2e/forbidden-store-then-qa-isolation.spec.mjs --repeat-each=6 --workers=1`  
**When:** 2026-10-19 UTC (spec **before** `sendHeartbeat` readiness wait).  
**Log:** `artifacts/forbidden-store-isolation/round2-branch-batch.log`

| Run | Result | Failure |
| --- | --- | --- |
| 1–6 | **Fail** | `waitForRealBoardBoxHeartbeat` → `receiverCloud heartbeat API unavailable` @ spec ~line 22–94 |

**Score: 0/6**

Per ROUND2 rules, **no second branch batch** was run to chase pass. QA should re-run locally on **pushed** spec if validating criterion 1.

---

## Main spec batch (one batch ×6)

**Spec:** `origin/main` (`fb8d162`) — file restored from git for batch only.  
**Command:** same as branch (`--repeat-each=6 --workers=1`).  
**When:** 2026-10-19 UTC (~15.1m wall).  
**Log:** `artifacts/forbidden-store-isolation/round2-main-batch.log`

| Run | Result | Notes |
| --- | --- | --- |
| 1 | Fail | Test timeout **180s** — `#btn-send-numbers` **disabled** on **ctrlB** click (harness `click` retry) |
| 2 | **Pass** | ~2.0s |
| 3–6 | Fail | Same as run 1 — **ctrlB** send never enabled before timeout |

**Score: 1/6**

Aligns with STOP.md: latent **outbound-ready** / **ctrlB** flake in same browser context after deny (main has no wipe / no explicit outbound wait).

---

## CI (criterion 1)

| Run | Head | This spec | Outcome |
| --- | --- | --- | --- |
| `39278656213` | `d2af9ec` | prior pushed stabilization | **Pass** (e2e) |
| `39283421869` | `a0209b4` | same as `d2af9ec` | **Fail** branch-only — `toBeEnabled` 60s **ctrlB** |

**After this push:** watch PR #108 CI for a new run; criterion 1 requires **green** + local **6/6** on pushed spec.

---

## UAT (QA manual)

1. Checkout `cursor/store-setup-screen-0c9f` at the commit that includes this `ROUND2.md` and the updated spec.  
2. Start e2e harness (`npx playwright test` webServer or project default).  
3. Run **once:** `npx playwright test tests/e2e/forbidden-store-then-qa-isolation.spec.mjs --repeat-each=6 --workers=1`.  
4. **Expect for pass:** 6 green; each iteration shows deny 「連線暫停」→ QA stores send on A, not on B, then send on B.  
5. **If red:** open log; branch failures likely outbound-ready (`等待看板連線…` / disabled send) or heartbeat wait; compare with `round2-main-batch.log` for main baseline flake.

---

## PR handoff

| | |
| --- | --- |
| **What changed** | ROUND2 spec (heartbeat + page order + outbound wait); `STOP.md`, `REPORT.md`, `ROUND2.md`, batch logs. |
| **Why** | Stabilize branch-only e2e without loosening assertions; document pass/fail for director QA gate. |
| **Excluded** | `tests/e2e/committed-artifacts/board-chime-overlay-1920.png` (unrelated). |
