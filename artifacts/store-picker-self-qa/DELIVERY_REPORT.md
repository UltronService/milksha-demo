# Store picker delivery report

## PR / CI

- PR: https://github.com/UltronService/milksha-demo/pull/29 (non-draft)
- HEAD: `ae56714a4949273acc5e4c9566a52baf4b808d0a`
- CI: https://github.com/UltronService/milksha-demo/actions/runs/37735400210 — **success**

## 1. Full e2e (GitHub CI)

| passed | failed | skipped |
|--------|--------|---------|
| 134 | 0 | 1 |

Log: `gh run view 37726698287 --log` → `134 passed`, `1 skipped` (28.3m).

Local rerun: `artifacts/store-picker-self-qa/e2e-full-summary.json` → 129 passed / 1 failed / 4 skipped (`guest-clock` font on this VM).

## 2. Requirement evidence

### 3a — 30s poll, background pause, foreground refresh

- Test: `controller-store-picker-evidence.spec.mjs` › `3a listStores pauses in background tab and refreshes on foreground`
- JSON: `artifacts/store-picker-self-qa/evidence/3a-background-foreground-listStores.json`
- Production interval: `StoreList.STORE_LIST_POLL_MS` = 30000 in `controller/store-list.js` (e2e uses `testStoreListPollMs=2000` on localhost only)

### 3b — zz-qa-* hidden; `?store=zz-qa-store-a` pinned

- Test: `controller-store-picker-evidence.spec.mjs` › `3b zz-qa hidden by default but URL-pinned zz-qa-store-a is selectable`
- JSON: `artifacts/store-picker-self-qa/evidence/3b-zz-qa-url-pin.json`

### 3c — no extra devLogin (2 min window + store switch)

- Test: `controller-store-picker-evidence.spec.mjs` › `3c two minutes: devLogin and listStores counts with store switch`
- JSON: `artifacts/store-picker-self-qa/evidence/3c-devlogin-liststores-2min.json`
- `devLoginDeltaAfterBoot`: **0**; `listStoresAfterBoot`: 1; `listStoresAfter`: 5 (30s poll)

### 3d — online/offline text + color, sorted by storeId

- Test: `controller-store-picker-evidence.spec.mjs` › `3d options sorted by storeId with online/offline text and color class`
- JSON: `artifacts/store-picker-self-qa/evidence/3d-sort-online-offline.json`
- Unit: `tests/store-list.test.js`

## 3. Live cloud (read-only)

- Screenshot: `artifacts/store-picker-self-qa/screenshots/live-cloud-store-picker.png`
- Public controller URL (after deploy): `https://ultronservice.github.io/milksha-demo/controller/?mode=cloud&store=c030020`
- `listStores` snapshot: `artifacts/store-picker-self-qa/live-listStores.json` (c030020 login only; no send/clear)

## 4. zz-qa-picker-new

- E2E store id used only with fake-cloud harness: `tests/e2e/controller-store-picker.spec.mjs` (`installBundledCloudRouteShim`)
- Live registry check: `artifacts/store-picker-self-qa/live-zz-qa-picker-new-check.json` → **`found`: false**

## 5. Branch / scope

- Merge-base with `origin/main`: `a82cb9b` (latest main at fetch time)
- Diff vs `main` limited to `controller/`, `tools/fake-cloud/`, `tests/`, `scripts/` — no `js/board` / home board source changes (board PNG drift reverted)
