# Store picker delivery report

## PR / CI

- PR: https://github.com/UltronService/milksha-demo/pull/29 (non-draft, mergeable)
- **Base (main):** `021ca6c4db6defc5748a8b885b8aad6460d215e2` (#28 + #30 merged)
- **HEAD (branch tip):** `b5ed5b55106a174e7fd328c629e166a8b0cc6aed`
- **CI:** https://github.com/UltronService/milksha-demo/actions/runs/37784424725 — **success**

## 1. Tests (CI on HEAD)

| suite | passed | failed | skipped |
|-------|--------|--------|---------|
| unit (`npm test`) | 147 | 0 | 0 |
| e2e (`npm run test:e2e`) | 137 | 0 | 1 |

Log: `gh run view 37772038242 --log` → `# tests 147`; `137 passed`, `1 skipped` (~27.3m).

Local e2e (this VM, no FONTCONFIG): 133 passed / 1 failed / 4 skipped — see `artifacts/store-picker-self-qa/e2e-full.log`.

## 2. Requirement evidence

### 3a — 30s poll, background pause, foreground refresh

- Test: `controller-store-picker-evidence.spec.mjs` › `3a listStores pauses in background tab and refreshes on foreground`
- JSON: `artifacts/store-picker-self-qa/evidence/3a-background-foreground-listStores.json`

### 3b — zz-qa-* hidden; `?store=zz-qa-store-a` pinned

- Test: `controller-store-picker-evidence.spec.mjs` › `3b zz-qa hidden by default but URL-pinned zz-qa-store-a is selectable`
- JSON: `artifacts/store-picker-self-qa/evidence/3b-zz-qa-url-pin.json`

### 3c — no extra devLogin (2 min window + store switch)

- Test: `controller-store-picker-evidence.spec.mjs` › `3c two minutes: devLogin and listStores counts with store switch`
- JSON: `artifacts/store-picker-self-qa/evidence/3c-devlogin-liststores-2min.json`

### 3d — online/offline text + color, sorted by storeId

- Test: `controller-store-picker-evidence.spec.mjs` › `3d options sorted by storeId with online/offline text and color class`
- JSON: `artifacts/store-picker-self-qa/evidence/3d-sort-online-offline.json`

## 3. Live cloud (read-only)

- Screenshot: `artifacts/store-picker-self-qa/screenshots/live-cloud-store-picker.png`
- `listStores` snapshot: `artifacts/store-picker-self-qa/live-listStores.json` (c030020 login only; no send/clear)

## 4. zz-qa-picker-new

- Fake-cloud only: `tests/e2e/controller-store-picker.spec.mjs`
- Live: `artifacts/store-picker-self-qa/live-zz-qa-picker-new-check.json` → **`found`: false**

## 5. Branch / scope

- Merged latest `main` at `021ca6c` (includes #28, #30); `js/receiver/cloud-runtime.js` matches main.
- Product diff vs `main`: controller store picker + fake-cloud/tests/scripts only (no board home logic changes).
