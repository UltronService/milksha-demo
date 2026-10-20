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
