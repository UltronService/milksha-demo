# CI split: PR/push (no real cloud) vs nightly (real cloud)

Owner decision (2026-10-18 10:09 Asia/Taipei): PR and push-to-main CI must not read/write **milksha-qms-dev** production Firestore. Real-cloud coverage moves to a **nightly** workflow (`cron: '0 20 * * *'` UTC = 04:00 Asia/Taipei) plus `workflow_dispatch`, store **`zz-qa-ci-store` only**.

Related in-flight fix: [PR #98](https://github.com/UltronService/milksha-demo/pull/98) (Playwright install before `npm test`, HTTP server cleanup on failed `chromium.launch()`).

---

## 1. PR / push CI (stay) — jobs, files, cloud guard

### 1.1 Workflows (target state)

| Workflow | Triggers | Jobs |
|----------|----------|------|
| `.github/workflows/ci.yml` | `pull_request`, `push` → `main` | **`test` only** (remove `e2e-live-cloud`) |
| `.github/workflows/deploy-pages.yml` | unchanged | deploy only (no test) |
| **New** `.github/workflows/ci-nightly.yml` | `schedule: 0 20 * * *`, `workflow_dispatch` | **`e2e-live-cloud`** (+ optional slow/local full regression — see §3) |

### 1.2 `test` job steps (PR / push)

1. `actions/checkout@v4` (`fetch-depth: 0` — keep for `asset-version.test.js`)
2. `actions/setup-node@v4` + `npm` cache
3. `npm ci`
4. **`npx playwright install --with-deps chromium`** (before unit tests — prevents `npm test` hang; PR #98)
5. **`npm test`** → `node scripts/run-unit-tests.mjs`
6. Install e2e fonts (Roboto, DejaVu)
7. **Playwright e2e (local / fake-cloud only)** — same glob as today:

```bash
find tests/e2e -name '*.spec.mjs' ! -name '*-live-cloud.spec.mjs' -print0
```

8. **No** `LIVE_CLOUD_STORE_ID`, **no** GitHub secrets for cloud, **no** `workflow_dispatch` inputs that select a production store.

Suggested job guardrails: `timeout-minutes: 15` on PR (after sharding or slow-spec split — §3), `concurrency` unchanged.

### 1.3 Unit tests on PR (`tests/*.test.js`, 72 files)

All picked up by `scripts/run-unit-tests.mjs` (only `tests/*.test.js`, not subdirs).

| File | Cloud touch |
|------|-------------|
| `asset-version.test.js` | git only |
| `auth-boot-server-time.test.js` | vm / no network |
| `auth-session-403-backoff.test.js` | vm |
| `auth-session-retry.test.js` | vm |
| `auth-target-url.test.js` | vm (hostname strings) |
| `board-anim-config.test.js` | vm |
| `board-business-date-source.test.js` | vm |
| `board-cell-integrity.test.js` | vm |
| `board-column-move-poll.test.js` | vm |
| `board-display-number-log-rules.test.js` | local Playwright + static HTTP site (no Firestore) |
| `board-empty-state.test.js` | vm |
| `board-list-diff.test.js` | vm |
| `board-no-motion-default.test.js` | vm |
| `board-no-motion-new-number-page1.test.js` | vm |
| `board-number-rules.test.js` | vm |
| `board-page-turn-desync.test.js` | vm |
| `board-pos-list.test.js` | vm |
| `board-ready-fade-regression.test.js` | vm |
| `board-seq.test.js` | vm |
| `board-setup-link.test.js` | vm |
| `business-date.test.js` | vm |
| `chime-policy.test.js` | vm |
| `cloud-api-auth.test.js` | vm / URL strings |
| `cloud-api-pos.test.js` | vm |
| `cloud-runtime-*.test.js` (6 files) | vm |
| `cloud-settings.test.js` | vm (asserts endpoint **strings**, no HTTP) |
| `column-move-plan.test.js` | vm |
| `config-resolve-production.test.js` | vm |
| `controller-*.test.js` (6 files) | vm |
| `delivery-number-format.test.js` | vm |
| `delivery-number-qa-live2.test.js` | vm (name legacy; **no live network** in file) |
| `dev-command-validation.test.js` | local `fake-cloud` HTTP on loopback |
| `device-command-time.test.js` | vm |
| `entry-a-pos-contract.test.js` | vm |
| `fake-cloud-business-date.test.js` | **`127.0.0.1` fake-cloud** |
| `fake-cloud-pos.test.js` | **`127.0.0.1` fake-cloud** |
| `firebase-auth-retry-sync.test.js` | vm |
| `firestore-realtime-listener.test.js` | vm |
| `firestore-realtime-pending.test.js` | vm |
| `firestore-rest-inflight-abort.test.js` | vm |
| `firestore-value.test.js` | vm |
| `guest-clock-anchor.test.js` | vm |
| `local-cloud-shim-target.test.js` | vm |
| `local-device-stale.test.js` | vm |
| `local-poc-coord.test.js` | vm |
| `milksha-board-official.test.js` | local Playwright + static site |
| `milksha-board-ref-ui-alignment.test.js` | local Playwright + static site |
| `milksha-board.test.js` | vm |
| `milksha-pos-receiver-rules.test.js` | local fake-cloud |
| `milksha-pos-sign.test.js` | vm |
| `playwright-check-cleanup-regression.test.js` | harness subprocess; **no** Firestore |
| `pos-md5-raw-wire.test.js` | local fake-cloud |
| `pos-user-hint.test.js` | vm |
| `receiver-dev-test-hooks.test.js` | vm |
| `receiver-skipped-command-ack.test.js` | vm |
| `ring-host.test.js` | vm |
| `ring-queue.test.js` | vm |
| `store-list.test.js` | vm |
| `taipei-clock.test.js` | vm |
| `today-board.test.js` | vm |

**Not in `npm test` today (assign in coverage manifest):**

- `tests/firestore-rules/realtime-board.rules.test.mjs` — **Firebase emulator only** (`npm run test:rules`); no production Firestore reads. **Recommend PR** after `firebase emulators:exec` step, or **nightly** if emulator install is too heavy for 15 min budget.

**Support files (not standalone tests):** `tests/fixtures/*.harness.mjs`, `tests/e2e/{harness,web-server,global-*,live-cloud-*}.mjs` — covered via parent tests.

### 1.4 E2E on PR (63 specs, fake-cloud / local)

Playwright `webServer` starts `tests/e2e/web-server.mjs` + harness spawns **`tools/fake-cloud/server.mjs`** on `127.0.0.1`. `installBundledCloudRouteShim` routes `firestore.googleapis.com` and `asia-east1-milksha-qms-dev.cloudfunctions.net` to **loopback fake-cloud**, not production.

| Spec file |
|-----------|
| `board-animation-highlight.spec.mjs` |
| `board-animation.spec.mjs` |
| `board-cell-peak-simulation.spec.mjs` |
| `board-cell-single-number.spec.mjs` |
| `board-column-move.spec.mjs` |
| `board-empty-hint-states.spec.mjs` |
| `board-empty-state.spec.mjs` |
| `board-no-connection-ui.spec.mjs` |
| `board-number-rules.spec.mjs` |
| `board-page-indicator-screenshots.spec.mjs` |
| `board-page-indicator.spec.mjs` |
| `board-page-turn-desync.spec.mjs` |
| `board-ready-fade-multi-apply.spec.mjs` |
| `board-ready-fade-pulse-cancel.spec.mjs` |
| `board-ready-scale-overlap-grid.spec.mjs` |
| `board-viewport-screenshots.spec.mjs` |
| `cloud-qa-checklist.spec.mjs` |
| `cloud-remote-send.spec.mjs` |
| `controller-actions.spec.mjs` |
| `controller-c030020.spec.mjs` |
| `controller-cloud-auth-warm.spec.mjs` |
| `controller-command-errors.spec.mjs` |
| `controller-connect-errors.spec.mjs` |
| `controller-local-buttons.spec.mjs` |
| `controller-no-board-online.spec.mjs` |
| `controller-post-send-board-read-abort.spec.mjs` |
| `controller-quick-send-resend.spec.mjs` |
| `controller-redesign-acceptance.spec.mjs` |
| `controller-simulate-offline-board.spec.mjs` |
| `controller-source-quick-send.spec.mjs` |
| `controller-store-picker-evidence.spec.mjs` |
| `controller-store-picker.spec.mjs` |
| `controller-store-simulation.spec.mjs` |
| `controller-zone-layout.spec.mjs` |
| `forbidden-store-then-qa-isolation.spec.mjs` |
| `fresh-browser-pause-heartbeat.spec.mjs` |
| `guest-clock.spec.mjs` |
| `home-board-art-alignment.spec.mjs` |
| `home-board-background-6min.spec.mjs` |
| `home-board-background-tab.spec.mjs` |
| `home-board-bare-root-cloud.spec.mjs` |
| `home-board-canvas-scale.spec.mjs` |
| `home-board-clear-then-push-stale-command.spec.mjs` |
| `home-board-cloud-recovery.spec.mjs` |
| `home-board-default-store.spec.mjs` |
| `home-board-first-number-after-open.spec.mjs` |
| `home-board-layout.spec.mjs` |
| `home-board-local-poc.spec.mjs` |
| `home-board-per-store-isolation.spec.mjs` |
| `home-board-per-store-switch.spec.mjs` |
| `home-board-quick-send-one.spec.mjs` |
| `home-board-realtime-emulator.spec.mjs` |
| `home-board-realtime-flag.spec.mjs` |
| `home-board-sort-tie-break.spec.mjs` |
| `home-board-stale-storage.spec.mjs` |
| `home-board-store-alignment.spec.mjs` |
| `home-board-ten-send-clear.spec.mjs` |
| `legacy-settings-two-store.spec.mjs` |
| `main-5501-local-baseline.spec.mjs` |
| `pr23-login-count.spec.mjs` |
| `pr-review-screenshots.spec.mjs` |
| `qa-pr16-auth-board.spec.mjs` |
| `screenshots.spec.mjs` |

**Skipped on PR unless `RUN_PUBLIC_E2E=1`:** `controller-zone-layout.spec.mjs` → public GitHub Pages test (would hit real hosting + real cloud if enabled). CI must **not** set this env.

### 1.5 How to verify PR jobs do not touch milksha-qms-dev

**A. Workflow static guard** — new unit test `tests/ci-pr-workflow-guard.test.js`:

- Parse `.github/workflows/ci.yml` on PR.
- **Fail** if `e2e-live-cloud` job exists, or `LIVE_CLOUD_STORE_ID` appears, or any step runs `*-live-cloud.spec.mjs`, or `secrets.` / `FIREBASE_` / `GOOGLE_APPLICATION_CREDENTIALS` referenced.
- Parse `.github/workflows/ci-nightly.yml` — **fail** if `schedule` missing or store id ≠ `zz-qa-ci-store`.

**B. Runtime network guard (e2e)** — in `tests/e2e/harness.mjs`, when `process.env.MILKSHA_CI_TIER === 'pr'`:

- `context.route('https://firestore.googleapis.com/**', abort)` unless request URL is rewritten to loopback (shim must register first).
- `context.route('https://asia-east1-milksha-qms-dev.cloudfunctions.net/**', abort)` unless proxied to `127.0.0.1:${PORT_CLOUD}`.
- Optional: fail test if `fetch('https://firestore.googleapis.com')` from Node in test body succeeds.

Set in `ci.yml` `test` job: `MILKSHA_CI_TIER: pr`.

**C. Live-cloud import guard** — unit test scans `tests/e2e/*.spec.mjs` assigned to `pr` and fails if file imports `live-cloud-config.mjs`, `board-animation-live-setup.mjs`, or `GITHUB_PAGES_BASE` navigation without `test.skip` in CI.

**D. Fake-cloud unit tests** — already loopback-only; assert `FAKE_CLOUD_PORT` host is `127.0.0.1` in `dev-command-validation` / `fake-cloud-*` if extended.

---

## 2. Nightly (move off PR / push)

### 2.1 Job `e2e-live-cloud` (from current `ci.yml`)

- **Specs (3):**
  - `tests/e2e/board-animation-live-cloud.spec.mjs`
  - `tests/e2e/controller-simulation-live-cloud.spec.mjs`
  - `tests/e2e/controller-source-live-cloud.spec.mjs`
- **Env:** `LIVE_CLOUD_STORE_ID: zz-qa-ci-store` (only); optional `LIVE_CLOUD_BOARD_DEVICE: stb-01`.
- **Concurrency:** `group: live-cloud-zz-qa-ci-store`, `cancel-in-progress: false`.
- **Uses:** `installLiveBranchCloudRoutes` + `https://ultronservice.github.io/milksha-demo` + **real** Firestore / Cloud Functions (reads/writes **milksha-qms-dev**).
- **Teardown:** `live-cloud-teardown.mjs` (`sendClearNow`, `teardownLiveCloudSession`).

### 2.2 Optional nightly extensions (not required for cloud-cost goal)

If PR must stay ≤15 min while keeping full local simulation coverage:

| Bucket | Files | Reason |
|--------|-------|--------|
| `slow-local` | `home-board-background-6min.spec.mjs`, `pr23-login-count.spec.mjs`, `cloud-qa-checklist.spec.mjs` (when `PR22_FULL_QA=1`) | Serial wall time ≫15 min |
| `rules-emulator` | `tests/firestore-rules/realtime-board.rules.test.mjs` via `npm run test:rules` | Heavy JVM/emulator; no prod Firestore |

**Default recommendation:** nightly = **live-cloud job only** first; add `slow-local` only if PR e2e cannot be sharded under 15 min.

### 2.3 Removed from PR / push

- Entire **`e2e-live-cloud`** job (§2.1).
- Any future workflow that hits production Firestore without `zz-qa-ci-store` guard.

*(Repo `origin/main` only has `ci.yml` + `deploy-pages.yml`; other ad-hoc workflows referenced in `artifacts/` are out of repo and not part of this split.)*

---

## 3. PR CI duration vs 15 min target

### 3.1 Measured (PR #98 branch, run `39049897918`, job `test`)

| Step | Duration (approx.) |
|------|---------------------|
| `npm ci` | ~72 s |
| `npx playwright install --with-deps chromium` | ~27 s |
| **`npm test`** | **~15 s** (294 tests after #98) |
| Install fonts | ~6 s |
| **E2E (non-live-cloud)** | **>43 min** when job cancelled at 45 min wall (did not finish) |

**Total observed:** ~46 min+ (failed/cancelled); **does not fit 15 min**.

Latest run `39053605136`: `npm test` failed in ~16 s (flake — likely `cpSync` / Playwright site copy; see §5); e2e skipped.

### 3.2 Fit in 15 min?

**No**, with current single serial Playwright job and full 63-spec suite.

Bottlenecks:

- `workers: 1` in `playwright.config.js`
- Long tests: `home-board-background-6min` (6 min wait), `pr23-login-count` (5 min + 2 min), `controller-store-picker-evidence` (70 s+ waits), many 90–180 s timeouts
- Cold `playwright install` ~30 s + `npm ci` ~70 s ≈ **~2 min fixed overhead**

### 3.3 Plan to hit ≤15 min (no production cloud)

1. **Merge PR #98** (install browsers before `npm test`; `try/finally` server cleanup).
2. **Remove `e2e-live-cloud` from `ci.yml`** (~40 min saved on PR).
3. **PR `test` job timeout `15`** (fail fast if regression).
4. **Playwright browser cache:** `actions/cache` on `~/.cache/ms-playwright` keyed by `package-lock.json` + browser version (save ~20–90 s).
5. **Shard PR e2e** into 3–4 parallel jobs (`e2e-shard-1` …) via `--shard=1/4` (Playwright 1.49 supports sharding), each `timeout-minutes: 15`, shared `webServer` per job.
6. **Or** move **slow-local** specs (§2.2) to nightly and keep PR on ~55 faster specs.
7. **Do not** relax Playwright `timeout` values or delete tests.

**Rough budget after (2)+(5):** ~2 min setup + ~15 s unit + ~8–12 min e2e per shard → **~12–14 min** wall on PR.

---

## 4. Assignment coverage (nothing missed)

### 4.1 Manifest

Add `tests/ci-test-tier-manifest.json`:

```json
{
  "pr": {
    "unit": ["tests/*.test.js"],
    "e2e": ["tests/e2e/*.spec.mjs", "!*-live-cloud.spec.mjs"],
    "optional": ["tests/firestore-rules/realtime-board.rules.test.mjs"]
  },
  "nightly": {
    "e2e_live_cloud": [
      "tests/e2e/board-animation-live-cloud.spec.mjs",
      "tests/e2e/controller-simulation-live-cloud.spec.mjs",
      "tests/e2e/controller-source-live-cloud.spec.mjs"
    ],
    "slow_local_optional": []
  }
}
```

### 4.2 Coverage test `tests/ci-test-tier-assignment.test.js`

- Glob all `tests/**/*.test.js`, `tests/e2e/**/*.spec.mjs`, `tests/firestore-rules/**/*.test.mjs`.
- Exclude explicit support paths: `tests/fixtures/**`, `tests/e2e/{harness,web-server,global-setup,global-teardown,ring-fit,live-cloud-config,live-cloud-teardown,board-animation-live-setup,realtime-emulator-harness}.mjs`.
- Assert each file appears in **exactly one** of `pr` or `nightly` tiers.
- Assert manifest globs match workflow shell commands in `ci.yml` / `ci-nightly.yml` (parse YAML or snapshot expected command strings).
- **Thresholds unchanged:** no edits to Playwright `timeout`, `expect` bounds, or `test.setTimeout` in specs.

### 4.3 Workflow parity checklist

- [ ] PR workflow runs manifest `pr` set only.
- [ ] Nightly runs manifest `nightly.e2e_live_cloud` only (+ optional buckets).
- [ ] `npm test` file list still equals sorted `tests/*.test.js` (regression against manifest).

---

## 5. Flaky `cpSync` / `.git` `ENOENT` (QA report)

### 5.1 Repro commands

```bash
# Parallel Playwright layout checks (fixed /tmp path in official-layout script)
node --test tests/milksha-board-official.test.js tests/milksha-board-ref-ui-alignment.test.js

# Or full unit suite under load
npm test

# Direct script (copies repo tree including .git)
node -e "import('./scripts/check-milksha-board-column-alignment.mjs').then(m => m.runCreamColumnBoundsCheck({}))"
```

Expect intermittent: `Error: ENOENT: no such file or directory, copyfile '.../.git/...'`.

### 5.2 Hypotheses

1. **`cpSync` filter only excludes `node_modules`**, not `.git` — recursive copy walks `.git/objects` or worktree gitfile and hits missing objects (shallow/sparse checkout, concurrent cleanup).
2. **`check-milksha-board-official-layout.mjs` uses fixed `/tmp/milksha-official-layout-site`** — parallel tests race `rmSync` + `cpSync` on the same path.
3. **`check-milksha-board-column-alignment.mjs` uses per-pid temp** but parallel **unit** tests still stress disk / `/tmp` concurrently.
4. **CI `fetch-depth: 0`** + partial cache restore → transient missing blob during copy.
5. **Node 20+ `fs.cpSync` `recursive: true`** follows symlinks under `.git` differently than local macOS, surfacing ENOENT on Linux runners only.

### 5.3 Fix plan (tests/scripts only)

1. Shared `copySiteForPlaywright(rootDir)` helper:
   - `filter: (src) => !src.includes('node_modules') && !src.includes('/.git') && !src.includes('\\.git/')`
   - Unique dest: `join(tmpdir(), 'milksha-site-' + process.pid + '-' + randomUUID())`
2. Replace fixed `/tmp/milksha-official-layout-site` with unique dir (official-layout script).
3. `try/finally` `rmSync(dest, { recursive: true, force: true })` after checks (already have browser/server finally in #98).
4. Add regression unit test: invoke `prepareSite` twice in parallel; assert no throw.
5. Apply same filter to `scripts/capture-*.mjs` when those run in CI.

---

## 6. Production code scope (PR #98)

**Confirmed:** diff `main...cursor/ci-npm-test-playwright-order-ce9c` touches only:

- `.github/workflows/ci.yml`
- `scripts/check-milksha-board-column-alignment.mjs`
- `scripts/check-milksha-board-official-layout.mjs`
- `tests/playwright-check-cleanup-regression.test.js`
- `tests/fixtures/playwright-launch-failure-*.harness.mjs`

**No** changes under `js/`, `controller/`, board HTML, or runtime cloud config. Nightly split plan is **workflow + test harness + manifest/guards only**.

---

## Implementation order (follow-up PR after #98)

1. Add `ci-nightly.yml` + remove `e2e-live-cloud` from `ci.yml`.
2. Add manifest + `ci-test-tier-assignment.test.js` + `ci-pr-workflow-guard.test.js`.
3. Add `MILKSHA_CI_TIER=pr` network guard in `harness.mjs`.
4. Shard PR e2e **or** nightly `slow-local` bucket; set PR `timeout-minutes: 15`.
5. `cpSync` / `.git` exclusion fix in check scripts.
