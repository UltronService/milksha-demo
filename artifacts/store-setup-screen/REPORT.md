# Store setup screen — delivery report

| Field | Value |
| --- | --- |
| PR | https://github.com/UltronService/milksha-demo/pull/108 |
| Head SHA | _(see latest push on branch)_ |
| Asset version | `20261019a` |
| Store id validator | `js/store-id.js` — same rules as main `controller/store-list.js` (`KNOWN_LITERAL`, `zz-qa-*`, `zz-deny-*`, `[a-z][0-9]{6}`). PR #105 dedicated module not on main; logic extracted without changing rules. |
| Unit tests | 351 passed (`npm test`) |
| CI run | _(filled after CI)_ |
| Branch-only e2e failures | _(filled after CI)_ |

## Item → test mapping

| # | Acceptance | Test |
| --- | --- | --- |
| 1 | No `store=` → setup | `tests/home-board-store.test.js` item 1; `tests/e2e/home-board-store-setup.spec.mjs` items 1–4 |
| 2 | `store=` empty → setup | `tests/home-board-store.test.js` item 2; e2e items 1–4 |
| 3 | `store=` whitespace → setup | `tests/home-board-store.test.js` item 3; e2e items 1–4 |
| 4 | Invalid format → setup | `tests/home-board-store.test.js` item 4; `tests/store-id.test.js`; e2e items 1–4 |
| 5 | `zz-qa-store-a` → board | `tests/home-board-store.test.js` item 5; e2e item 5 |
| 6 | `a17` / `c030020` URL parse only | `tests/home-board-store.test.js` item 6 (unit, no cloud) |
| 7 | Static (default) board | e2e `home-board-store-setup.spec.mjs` items 1–5, `home-board-bare-root-cloud.spec.mjs` |
| 8 | `motion=on` | e2e `home-board-store-setup.spec.mjs` motion cases |
| 9 | Old bind record + no URL → setup | `tests/board-store-setup-bind-record.test.js`; e2e items 9–11 |
| 10 | Old record + invalid URL → setup | e2e items 9–11 |
| 11 | Old record not modified | `tests/board-store-setup-bind-record.test.js`; e2e items 9–11 |
| 12 | No cloud / login / pair network | e2e item 12 |
| 13 | No runtime `c030020` default | `tests/board-no-default-c030020.test.js` |
| 14 | Setup text layout / system fonts | `tests/board-no-default-c030020.test.js` CSS/HTML; e2e item 14 |

## Unverified

- Item 14 on a physical TV-box Chromium build (only 1920×1080 and 1280×720 local Playwright viewports).

## Removed `c030020` default locations (board boot path)

| File | Before |
| --- | --- |
| `js/receiver/cloud-boot.js` | `defaultHomeBoardStoreId()` → `c030020` when `store` missing on home board |
| `js/transport/local-poc-coord.js` | `DEFAULT_STORE_ID = 'c030020'` for `homeBoard` without POC target |
| `tests/e2e/harness.mjs` | `resolveReceiverStoreId` returned `c030020` for home board |

Controller / `validate-request.js` `DEFAULT_HOME_BOARD_STORE_ID` unchanged (operator UI only).

## E2E / unit specs updated for new behavior

- `tests/e2e/home-board-bare-root-cloud.spec.mjs` — was: bare `/` boots `c030020`
- `tests/e2e/home-board-default-store.spec.mjs` — was: no store uses `c030020` local boot
- `tests/milksha-board-layout-harness.test.js` + `scripts/check-milksha-board-column-alignment.mjs` — layout harness adds `store=zz-qa-store-a`
- `tests/local-poc-coord.test.js` — home without store must not default
- E2E harness `homeBoardUrl` / `urlsLocalHomePoc` — tests that boot home board without explicit store (cloud-recovery, cloud-remote-send, cloud-qa-checklist, pr23-login-count, controller-simulate-offline, stale-storage, redesign-acceptance, layout scripts)

## Manual UAT (zz-qa only)

1. Open `/?store=zz-qa-store-a` → number grid appears; no setup overlay.
2. Open `/` → full screen **請設定店編號** only; no numbers; no cloud spinner.
3. Open `/?store=abc` → same setup screen.
4. Open `/?motion=on&store=zz-qa-store-a` → board with motion.
5. Open `/?motion=on` → setup screen only.
