# STOP — `forbidden-store-then-qa-isolation`

**Directive:** All test reruns **stopped**. No merge, no deploy, no loosened assertions. Secrets: `<REDACTED>` (not used in this spec).  
**Branch:** `cursor/store-setup-screen-0c9f` (PR #108)  
**Remote HEAD:** `a0209b4` — last **pushed** change to this spec: **`d2af9ec`**  
**Written (UTC):** 2026-10-19  

Related read-only note: `artifacts/forbidden-store-isolation/REPORT.md` (diagnosis at `a0209b4`).

---

## 1. Root cause

### Where it fails

After `zz-deny-test` → storage wipe → same browser context opens `zz-qa-store-a` / `zz-qa-store-b` boards and controllers, the test blocks on **`waitControllerOutboundReady`** (pushed `d2af9ec`):

1. **`#online-state[data-connected="1"]`** — usually passes within 60s.  
2. **`expect([data-testid="btn-send-numbers"]).toBeEnabled({ timeout: 60000 })`** — **often never passes** before timeout.

So the missing state is **not** “controller transport disconnected”; it is **outbound send readiness**: the board must be seen as online via heartbeat/device poll before the controller enables send.

### Product behavior (unchanged on #108 for `controller-app.js`)

- `getActionBlockReason()` can return **「等待看板連線…」** while `connected === true`.  
- Then `#btn-send-numbers` stays **`disabled`** / **`aria-disabled="true"`** and **`[data-testid="btn-send-numbers-block-reason"]`** is **visible** with that text.  
- Cloud path needs `boardReadyForOutboundSend()` → `deviceOnline` from `pollDevice()` reading board `boxHeartbeat` / device doc — not merely URL `store=` or `QMS.StoreId` validation.

**Not root cause:** #108 home setup gate / `js/store-id.js` for boards without `store=` — controllers use `/controller/?mode=cloud&store=zz-qa-*` and are not blocked as invalid store.

### Evidence (logs / traces)

**GitHub Actions — run `39283421869` (branch-only vs main `39136354686`), shard e2e 17, head `a0209b4` (same spec as `d2af9ec`):**

```
Error: Timed out 60000ms waiting for expect(locator).toBeEnabled()
Locator: locator('[data-testid="btn-send-numbers"]')
  64 × locator resolved to <button disabled type="button" aria-disabled="true"
       id="btn-send-numbers" data-requires-connect="1" data-testid="btn-send-numbers" ...>
  送出號碼
  </button>
  - unexpected value "disabled"

at waitControllerOutboundReady (.../forbidden-store-then-qa-isolation.spec.mjs:10:66)
at .../forbidden-store-then-qa-isolation.spec.mjs:67:5    ← second controller (ctrlB)
```

**Local (boards-before-controllers experiment):**

```
locator resolved to <span ... data-testid="btn-send-numbers-block-reason">等待看板連線…</span>
- unexpected value "visible"
```

**Local (main-style failure mode — isolation, not send button):**

```
expect(boardB.locator('.milksha-ready .milksha-num')).toHaveCount(0)
Expected: 0  Received: 1
```

**Local environment noise (invalidates some batches):**

```
[cause]: Error: connect ECONNREFUSED 127.0.0.1:8787
at proxyToFakeCloud (tests/e2e/harness.mjs:264)
```

**CI contrast:** Same e2e on `d2af9ec` **passed** run `39278656213`; **failed** run `39283421869` — same product, timing flake + stricter assertion.

---

## 2. Every change made so far

### A. Committed and pushed (this spec + related PR work)

| Commit | Files | Summary |
| --- | --- | --- |
| **`e7ff2aa`** | Many (#108 feature); touched this spec only if in parity batch | PR #108 store setup, assets `20261019g`, broad e2e harness updates — **not** the stabilization loop focus |
| **`0750449`** | `tests/e2e/forbidden-store-then-qa-isolation.spec.mjs`, `artifacts/store-setup-screen/REPORT.md` | After deny: `clearCookies()` (later removed); removed extra board/controller waits; **added `toBeEnabled` 60s on ctrlB only** before second send |
| **`3dba156`** | `tests/e2e/forbidden-store-then-qa-isolation.spec.mjs` | Replaced cookies with **wipe tab** `GET /` + `localStorage`/`sessionStorage` clear; **removed** ctrlB-only `toBeEnabled` before click |
| **`d2af9ec`** | `tests/e2e/forbidden-store-then-qa-isolation.spec.mjs` | Added **`waitControllerOutboundReady`**: `data-connected` 60s + **`toBeEnabled` 60s** for **both** ctrlA and ctrlB; `boardB` pause hidden |
| **`a0209b4`** | `artifacts/store-setup-screen/REPORT.md` only | Docs; **no spec change** |

**Main (`fb8d162`) vs pushed (`d2af9ec`) on this file:** +15 / −2 lines — wipe, stricter outbound wait, no change to store IDs (`zz-deny-test`, `zz-qa-store-a`, `zz-qa-store-b`).

### B. Committed docs on branch (not this STOP file until local)

- `artifacts/store-setup-screen/REPORT.md` — PR #108 delivery / CI notes (updated across commits).

### C. Uncommitted local only (do not push per STOP)

| Path | Change |
| --- | --- |
| **`tests/e2e/forbidden-store-then-qa-isolation.spec.mjs`** | +57 / −7 vs `d2af9ec`: `nudgeBoardHeartbeat()` (`sendHeartbeatForTests` / `boxHeartbeat` 200), `expect.poll` (60s cap) until block-reason hidden + enabled, triple nudge A/B, peer-board nudge in wait; `toHaveCount(0, { timeout: 10000 })` |
| **`artifacts/forbidden-store-isolation/REPORT.md`** | Read-only diagnosis |
| **`artifacts/forbidden-store-isolation/STOP.md`** | This document |
| **`tests/e2e/committed-artifacts/board-chime-overlay-1920.png`** | Unrelated local diff — **not** part of forbidden-store work |
| **`artifacts/store-picker-self-qa/e2e/`** | Untracked — **not** part of this fix |

**No product code** (`js/`, `controller/`, `index.html`, etc.) changed in the uncommitted stabilization attempts.

---

## 3. All pass rates measured

**Method:** fake-cloud, spec only, `zz-qa-*` / `zz-deny-test`. **No further runs after STOP.**

### Six separate CLI runs (`npx playwright test` × 6 per batch)

| Spec version | Pass rate |
| --- | --- |
| Pushed **`d2af9ec`** | **3/6** |
| Uncommitted poll + nudge (parallel 4 tabs) | **3/6**, **2/6**, **1/6** |
| Boards-first / deferred ctrlB variants | **0/6** – **2/6** |
| After fake-cloud `ECONNREFUSED` | **0/6** (multiple batches) |
| Poll + nudge (cloud healthy) | **1/6** (single batch) |

### One invocation `--repeat-each=6 --workers=1`

| Attempt | Pass rate |
| --- | --- |
| 1 | **2/6** |
| 2 | **4/6** |
| 3 | **3/6** |
| 4 | **3/6** |
| Another | **3/6** |

### Automated multi-batch searches (6 runs per batch)

| Loop | Batches logged | Best batch | **6/6 achieved?** |
| --- | --- | --- | --- |
| 20-batch gate | 1–20 | **5/6** (batch 10) | **No** |
| 50-batch gate (partial) | many | **4/6** | **No** |
| 25-batch repeat-each (aborted) | 1–8 | **4/6** (attempt 1) | **No** |

### Main baseline (short sample, `fb8d162` spec, full tree checkout)

| Runs | Pass rate |
| --- | --- |
| 3 | **3/3** |

(Repo CI baseline still lists this spec as flaky on main; PR #95 also fails it.)

### Stabilization gate required by director

**6/6 in one batch — never achieved** (committed or uncommitted spec).

---

## 4. Test-only fix possible? (no product code, no loosened assertions)

### Is it possible?

**Yes, in principle** — the scenario under test is valid; failures are **synchronization**, not wrong store rules. **Not proven** in this session at **6/6**.

**Must keep (no loosening):**

- `expect([data-testid="btn-send-numbers"]).toBeEnabled({ timeout: 60000 })` (or equivalent strict check).  
- No skip, no longer timeouts, no removing outbound checks, no reverting to “only `data-connected` then blind click”.

### How (test-only, recommended directions)

1. **Order:** Ensure both **boards** reach `receiverCloud` + not paused, then **nudge `boxHeartbeat`** (wait for HTTP 200 if stable), then open **controllers** (or defer **ctrlB** until after store A send + `boardB` count 0).  
2. **Wait on real signals:** Within existing 60s caps, poll until  
   - `#online-state[data-board-online="1"]` when set, **and**  
   - `[data-testid="btn-send-numbers-block-reason"]` hidden, **and**  
   - button enabled — then assert `toBeEnabled` again.  
3. **Execution:** Run verification as **`--repeat-each=6 --workers=1`** so one `beforeAll` fake-cloud boot avoids `8787` refused between six isolated CLI processes.  
4. **Do not:** Drop `toBeEnabled`, shorten below product needs, or use retries that swallow failures.

### If product code were allowed (optional, not required for correctness)

| Area | Why |
| --- | --- |
| `controller/controller-app.js` | Expose a single **outbound-ready** flag aligned with send button state, or delay showing `data-connected="1"` until board online — reduces E2E race **without** weakening tests. |

**Verdict:** A **test-only** path is **feasible and aligned with rules**; the uncommitted poll/nudge patch is a step in that direction but **did not reach 6/6**. Product change is **not mandatory** to explain branch-only CI; it would only make synchronization easier.

---

## 5. STOP checklist

| Action | Status |
| --- | --- |
| Test reruns | **Stopped** |
| Commit / push stabilization edits | **Not done** (local spec + artifacts only) |
| Merge / deploy | **No** |
| Loosen assertions | **No** |
