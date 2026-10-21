# Preview channel UAT (PR #111) — 2026-10-20

## CORS (milksha-qms-dev Cloud Functions)

- **Root cause:** Preview Hosting origin was missing from browser CORS allowlist → `Failed to fetch` / `httpStatus: 0`.
- **Director rule:** Only **add** preview origin; keep `https://ultronservice.github.io` and existing entries; never prod.
- **Agent action:** No Functions deploy from this repo (would risk overwriting backend **PR #43**). Verified preflight **2026-10-20 ~21:29 Taipei**:
  - `Origin: https://milksha-qms-dev--pr111-pos-sort-hhlwo90z.web.app` → `Access-Control-Allow-Origin` matches preview.
  - `Origin: https://ultronservice.github.io` → still allowed.
- **If preview URL changes** (new channel suffix): backend must **add** the new exact origin on **milksha-cloud #43** branch deploy only (not main).

## URLs (verbatim)

| Page | URL |
|------|-----|
| Board | `https://milksha-qms-dev--pr111-pos-sort-hhlwo90z.web.app/?mode=cloud&store=zz-qa-store-a&device=qa-pc-01` |
| Controller | `https://milksha-qms-dev--pr111-pos-sort-hhlwo90z.web.app/controller/?mode=cloud&store=zz-qa-store-a&device=qa-pc-01` |

## Test send (once)

- **Store:** `zz-qa-store-a` only  
- **Device in command:** `qa-pc-01` (not `stb-01`)  
- **Payload:** `push_numbers` → `preparing: ["2001","2002","2003"]`, `ready: []`  
- **Result:** HTTP 200, `commandId` `b302c34a-b82a-478e-b0aa-3761efd95fda`

## Browser verification

- Board: online (no boot error / 離線 / 連線暫停).
- Controller: online (`zz-qa-store-a` online in UI).
- Board after send: preparing shows **2001, 2002, 2003**.

## Screenshots

| File | Description |
|------|-------------|
| `artifacts/pos-time-sort/preview-uat/01-board-online.png` | Board connected |
| `artifacts/pos-time-sort/preview-uat/02-controller-online.png` | Controller connected |
| `artifacts/pos-time-sort/preview-uat/03-board-numbers-2001-2003.png` | Preparing 2001–2003 visible |

Commit: `74ec7ddd15a6704f4c029276cee0d89c39873770` (PR #111 head at deploy time).

## Redo (director, 2026-10-20 ~21:55 Taipei)

- **04-controller-online.png**: Both tabs reloaded; controller pill **「已連線 · 看板在線」** (no「看板離線」/「等待看板連線」). Requires `#fld-device` = `qa-pc-01` (URL `device=` is **not** applied to the form — see footer section).
- **05-board-cleared.png**: `btn-clear-board-main` → modal **確認清空** → banner「看板已清空」; board empty after reload.

###「看板離線」root cause (when URL has `device=qa-pc-01`)

Controller boot (`controller-app.js` ~2383–2464) reads `mode` / `gateway` from query but **never** sets `#fld-device` from `?device=`. Field stays default **`stb-01`** (`controller/index.html` + `pinCloudDeviceDefaults`). `pollDevice()` heartbeats **`fld-device`**, while the board uses URL **`qa-pc-01`** → controller thinks board offline until the form is set to `qa-pc-01`.

### Footer `zz-qa-store-azz-qa-store-a`

- **Cause:** `js/board/board-auto-pair-host.js` `renderBindHint` (~88–99): `storeName` in `.milksha-board-bind-hint__name`, then `storeNumber` at start of `.milksha-board-bind-hint__suffix` with **no separator** between spans; when both equal `zz-qa-store-a` it reads as one glued string. Same pattern in `js/board/board-auto-pair.js` `formatBindHintText` (~291): `storeName + storeNumber`.
- **Sort test (#111):** Cosmetic only; does **not** affect `board-item-sort` or POS ms ordering.
- **main / Pages:** Same code on `main` (`board-auto-pair-host.js` identical); **same bug** wherever auto-pair hint shows name + number.

## clear_now proof (director 22:40)

See **`CLEAR-PROOF.md`**. Summary: UI clear uses `#fld-device` (default **stb-01**); URL `?device=qa-pc-01` is **not** applied. With default form, **清空看板** stays **disabled** until `#fld-device` = **qa-pc-01**. Aborted network capture confirms safe body only after that fix. **No new clear** after director warning.
