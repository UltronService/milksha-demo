# clear_now target proof (preview UAT)

## Code path (controller)

- `runClearBoardConfirmed()` → `sendCommand('clear_now', {})` (`controller/controller-app.js` ~792–797).
- `sendCommand` builds body from **`#fld-store`** and **`#fld-device`**, fallback **`stb-01`** (~1594–1601):

```javascript
deviceId = document.getElementById('fld-device').value.trim() || 'stb-01';
{ storeId: storeId(), deviceId, type: 'clear_now', params: {} }
```

- Boot reads `?store=` into `#fld-store` but **does not** read `?device=` into `#fld-device` (~2383–2464; only `pinCloudDeviceDefaults` forces **stb-01** when query has no device).

## Network capture (2026-10-20, requests **aborted** — not executed)

Controller URL: `…/controller/?mode=cloud&store=zz-qa-store-a&device=qa-pc-01`, board tab open on same store/device.

| Step | `#fld-device` | Clear button | Would send / captured POST body |
|------|---------------|--------------|----------------------------------|
| Default after load | **stb-01** (URL `device=qa-pc-01` ignored) | **disabled** (看板離線) | `{ storeId: "zz-qa-store-a", deviceId: "stb-01", type: "clear_now", params: {} }` — **no request sent** (button disabled) |
| After setting `#fld-device` to **qa-pc-01** | qa-pc-01 | enabled | **Captured (aborted):** `{ "storeId": "zz-qa-store-a", "deviceId": "qa-pc-01", "type": "clear_now", "params": {} }` |

## Store vs device scope (repo model)

- Fake cloud `clear_now` clears **`stores/{storeId}/board/today_board`** (store-wide tickets), while attaching pending command to **`deviceId`** (`tools/fake-cloud/server.mjs` ~954–964).
- Live board UI for a store reads that shared today board; **`deviceId` in devCommand is the command routing target**, not a separate per-device number list in this demo.

## Earlier clears this run (already hit server — report only)

| When | How | Payload |
|------|-----|---------|
| UAT investigation | **curl** devCommand (not UI) | `{ storeId: "zz-qa-store-a", deviceId: "stb-01", type: "clear_now", params: {} }` → HTTP 200 |
| Same | **curl** devCommand | `{ storeId: "zz-qa-store-a", deviceId: "qa-pc-01", type: "clear_now", params: {} }` → HTTP 200 |
| `preview-uat-redo.mjs` | UI modal after **`#fld-device`=qa-pc-01** | Same as qa-pc-01 row (not logged to file; script used modal clear) |

**No additional clear pressed for this director proof** (post-warning).

## Controller bug?

**Yes:** `?device=` on controller URL does not sync to `#fld-device`; default **stb-01** → wrong heartbeat target and would send **stb-01** in devCommand if the button were enabled.

**main:** Same `sendCommand` / boot logic on `main` (no `params.get('device')` for `#fld-device`).

## Safe clear rule for manual UAT

Only click **清空看板** when `#fld-device` is **qa-pc-01** and store is **zz-qa-store-a**. With default form, button stays disabled; do **not** force-enable or use test-tools clear without checking the field.
