# Store picker delivery report

## PR / CI

- PR: https://github.com/UltronService/milksha-demo/pull/29 (non-draft)
- **Base (main):** `b0980bc35d8104b61b7bc693d2c049ff975333ed` (#31 merged)
- **HEAD (branch tip):** `da40454b335fb7613e4e4cf58bfc67e52f4f2d76`
- **CI:** https://github.com/UltronService/milksha-demo/actions/runs/37812304093 — **success**

## 1. Tests (CI on HEAD)

| suite | passed | failed | skipped |
|-------|--------|--------|---------|
| unit (`npm test`) | 147 | 0 | 0 |
| e2e (`npm run test:e2e`) | 137 | 0 | 1 |

Log: `gh run view 37796461856 --log` → `# tests 147`; `137 passed`, `1 skipped` (~27.2m).

Local e2e (this VM, no FONTCONFIG): 133 passed / 1 failed / 4 skipped — `artifacts/store-picker-self-qa/e2e-full.log`.

## 2. Requirement evidence

### 3a — 30s poll, background pause, foreground refresh

- JSON: `artifacts/store-picker-self-qa/evidence/3a-background-foreground-listStores.json`

### 3b — zz-qa-* hidden; `?store=zz-qa-store-a` pinned

- JSON: `artifacts/store-picker-self-qa/evidence/3b-zz-qa-url-pin.json`

### 3c — no extra devLogin (2 min window + store switch)

- JSON: `artifacts/store-picker-self-qa/evidence/3c-devlogin-liststores-2min.json`

### 3d — online/offline text + color, sorted by storeId

- JSON: `artifacts/store-picker-self-qa/evidence/3d-sort-online-offline.json`

## 3. Live cloud (read-only)

- Screenshot: `artifacts/store-picker-self-qa/screenshots/live-cloud-store-picker.png`
- `listStores`: `artifacts/store-picker-self-qa/live-listStores.json` (c030020 read-only)

## 4. zz-qa-picker-new

- `artifacts/store-picker-self-qa/live-zz-qa-picker-new-check.json` → **`found`: false**

## 5. Branch / scope

- Merged `main` at `b0980bc`; controller store picker vs `main` only in `controller/`, `tools/fake-cloud/`, `tests/`, `scripts/`, `artifacts/store-picker-self-qa/`.
