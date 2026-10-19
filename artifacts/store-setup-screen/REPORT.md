# Store setup screen — delivery report

| Field | Value |
| --- | --- |
| PR | https://github.com/UltronService/milksha-demo/pull/108 |
| Head SHA | `d2af9ec` |
| Asset version | `20261019g` |
| Unit tests | 354 passed (`npm test`) |

## Asset version collision avoidance

| PR | Branch | `config/asset-version.json` |
| --- | --- | --- |
| #105 | `cursor/store-id-rule-de1b` | `20261019a` |
| #95 | `cursor/controller-default-number-5dd5` | `20261019d` |
| #107 | `cursor/limit-500-numbers-7037` | `20261019e` |
| **#108 (this)** | `cursor/store-setup-screen-0c9f` | **`20261019g`** |

## `js/store-id.js` vs PR #105 (`js/shared/store-id.js`)

| Topic | PR #105 | This PR (#108) |
| --- | --- | --- |
| Path | `js/shared/store-id.js` | `js/store-id.js` |
| Export | `QMS.Shared.StoreId` | `QMS.StoreId` |
| Rules | `normalizeStoreId` (trim + lower); valid = `zz-qa-*`, `zz-deny-*`, `[a-z][0-9]{2}`, `[a-z][0-9]{6}` | **Same rules** (aligned in latest commit) |
| Legacy literals | No `KNOWN_LITERAL` set | Removed (was main `store-list` only) |

**Merge conflict risk:** **High** on path + namespace + `controller/store-list.js` / `index.html` script tags. Resolution: keep one module (`js/shared/store-id.js` preferred from #105), re-export or alias `QMS.StoreId` → `QMS.Shared.StoreId`, point `home-board-store.js` at shared API, single asset version bump after merge.

## CI vs main (e2e failure names)

Compare normalized `(spec.mjs :: test title)` from `gh run view --log-failed`:

| Run | Branch (`d2af9ec`) | Main |
| --- | --- | --- |
| Run ID | `39278656213` | `39136354686` |
| Failed e2e cases (unique) | **7** | **10** |
| Branch-only failures | **0** | — |
| ⊆ main? | **Yes** — every branch failure title appears in main’s failed set | — |

Branch failed cases (all present on main): `board-cell-peak-simulation` peak run; `cloud-remote-send` ten sends; `controller-post-send-board-read-abort` HTTP 500 rollback; `controller-store-picker-evidence` 3c; `home-board-cloud-recovery` B-N07; `pr23-login-count` 5 min idle (×2 shard titles).

Main-only failures (pass on branch): `cloud-qa-checklist` cable pull; `controller-store-picker` poll window; `fresh-browser-pause-heartbeat` boxHeartbeat 403.

`forbidden-store-then-qa-isolation` — **pass** on branch run `39278656213` (wait outbound-ready + post–`zz-deny` storage wipe).

## Item → test mapping (14)

| # | Acceptance | Test |
| --- | --- | --- |
| 1 | No `store=` → setup | `tests/home-board-store.test.js` item 1; `tests/e2e/home-board-store-setup.spec.mjs` |
| 2 | `store=` empty → setup | item 2; e2e items 1–4 |
| 3 | Whitespace `store=` → setup | item 3; e2e items 1–4 |
| 4 | Invalid format → setup | item 4; `tests/store-id.test.js`; e2e items 1–4 |
| 5 | `zz-qa-store-a` → board | item 5; e2e item 5 |
| 6 | `a17` / `c030020` URL parse (unit only) | item 6 |
| 7 | Static board | e2e setup + bare-root specs |
| 8 | `motion=on` | e2e motion cases |
| 9–11 | Bind record ignored / unchanged | `tests/board-store-setup-bind-record.test.js`; e2e 9–11 |
| 12 | No cloud network on setup | e2e item 12 |
| 13 | No runtime `c030020` default | `tests/board-no-default-c030020.test.js` |
| 14 | Setup UI fonts / layout | CSS/HTML tests + e2e item 14 |

## Unverified

- Item 14 on physical TV-box Chromium (Playwright 1920×1080 / 1280×720 only).

## Removed `c030020` default (board boot)

| File | Change |
| --- | --- |
| `js/receiver/cloud-boot.js` | Removed `defaultHomeBoardStoreId()` |
| `js/transport/local-poc-coord.js` | No home default `c030020` |
| `tests/e2e/harness.mjs` | `homeBoardUrl` / no implicit `c030020` |

## E2E specs updated for setup gate

- `home-board-bare-root-cloud.spec.mjs`, `home-board-default-store.spec.mjs`, harness `urlsLocalHomePoc`, cloud-recovery / cloud-remote-send / cloud-qa-checklist / pr23 / stale-storage / store-alignment / redesign-acceptance (sync URLs only).
