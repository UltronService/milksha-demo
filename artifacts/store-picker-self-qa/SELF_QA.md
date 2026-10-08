# Store picker self-QA

## Unit (`npm test`)
- `tests/store-list.test.js`: sort, hide test stores, URL pin, online/offline labels, store id format, 403 messages, list error line.

## E2E (fake-cloud)
- `tests/e2e/controller-store-picker.spec.mjs`: 403 format / unregistered / registry full, new store poll, switch-store heartbeat, devLogin count, list error keeps menu.
- Related: `controller-cloud-auth-warm`, `fresh-browser-pause-heartbeat`, `cloud-remote-send`, `controller-c030020`.

## Evidence JSON (3a–3d)
- `artifacts/store-picker-self-qa/evidence/3a-background-foreground-listStores.json`
- `artifacts/store-picker-self-qa/evidence/3b-zz-qa-url-pin.json`
- `artifacts/store-picker-self-qa/evidence/3c-devlogin-liststores-2min.json`
- `artifacts/store-picker-self-qa/evidence/3d-sort-online-offline.json`

## Screenshots
- `artifacts/store-picker-self-qa/screenshots/store-picker-online-offline.png`
- `artifacts/store-picker-self-qa/screenshots/store-list-error-hint.png`
- `artifacts/store-picker-self-qa/screenshots/live-cloud-store-picker.png`

## Live (read-only)
- `artifacts/store-picker-self-qa/live-listStores.json`
- `artifacts/store-picker-self-qa/live-zz-qa-picker-new-check.json`
- `artifacts/store-picker-self-qa/live-unregistered-devlogin.json` (controller-only `zz-deny-test`, no board)

## E2E summary
- `artifacts/store-picker-self-qa/e2e-full-summary.json`
