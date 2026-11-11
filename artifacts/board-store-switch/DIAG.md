# Board URL `?store=` vs stored auto-pair binding

**Type:** read-only investigation (no product fix)  
**Branch:** `cursor/board-store-switch-diag-de1b`  
**Date (Taipei):** 2026-10-19  
**QA scenario:** Same browser profile — open board `?mode=cloud&store=zz-qa-store-a` (pairs), close tab/window, **do not** clear site data, then open `?mode=cloud&store=a17` → board remains bound to `zz-qa-store-a` (hint / pairing), not `a17`. Board only; no send numbers / clear.

---

## 1. Verdict: by design (PR #97), not introduced by PR #105

| Question | Answer |
|----------|--------|
| Intentional? | **Yes**, for “same device + same site storage, later boot reuses stored bind.” |
| Bug in #105 store-id work? | **No** — `runPair()` bind-vs-URL logic is unchanged on `cursor/store-id-rule-de1b` vs `main`. |
| 10/17 decision covered “URL store ≠ stored bind”? | **No explicit coverage** — specs/tests only prove **reload same URL** uses read path, not **change `?store=`**. |

### Code path (stored binding wins over URL)

1. **URL → boot** — `js/receiver/cloud-boot.js` `readCreds()` reads `store` query into `creds.storeId` and passes it as `storeNumber` into auto-pair host.
2. **Pair orchestration** — `js/board/board-auto-pair-host.js` `startBoardAutoPair()` → inner `runPair()`:
   - If `localStorage` has `milksha:board-bind-record` (`js/board/board-auto-pair.js` `STORAGE_BIND_RECORD`), **`hasBindRecord()` is true** → payload is **read path** `{ storeId: record.storeId, deviceId }` — **URL `store` is ignored** for pairing.
   - Else → **initial path** `{ brand, storeNumber: <from URL>, deviceId }`.
3. **After success** — `onPairSuccess()` writes/updates `milksha:board-bind-record` with API `storeId` / `storeNumber` (display uses full id, e.g. `a17` not `17` when that store was first bound).
4. **Runtime store** — `cloud-boot.js` sets `creds.storeId = pairResult.storeId` after pair; cloud runtime follows **paired** store, not a mismatched URL.

**Storage:** `localStorage` only (`milksha:board-bind-record`, `milksha:board-bind-hint-ever`, device id keys). No IndexedDB for bind record in this flow.

### Documented / tested intent (2026-10-17 → #97)

| Source | What it says |
|--------|----------------|
| `artifacts/auto-pair/REPORT.md` | 初次 `{ brand, storeNumber, deviceId }`；**有本地紀錄** `{ storeId, deviceId }`. UAT #2: **F5 同頁** → Network 僅 read 路徑。 |
| Old self-test table (commit `100f455`) | **「已綁定後重新載入不再送綁定」** — pass (reload, not URL change). |
| Commit `100f455` | “read path with storeId; pair before auth via customToken”. |
| PR **#97** body | milksha-cloud `boardAutoPair`: initial vs **read** `storeId + deviceId`. |
| `tests/e2e/home-board-auto-pair.spec.mjs` | `reload uses read path; initial bind only once` — **same URL** reload. |
| `tests/e2e/home-board-auto-pair-live-cloud.spec.mjs` | `restart uses read path only` — reload, same store. |

**Tension:** `docs/per-store-url-plan.md` says看板「以 URL `store` 決定店號」與快取隔離，但 **does not override** auto-pair #97 “sticky bind record” behavior. No ADR in-repo resolves URL-change vs bind record.

### Android / deployed STB

Ultron APK WebView uses the same origin storage as the browser. **`milksha:board-bind-record` persists** across in-app opens the same way → **field STBs behave like QA** (first paired store sticks until site data cleared or record removed). No separate “unbind” UI in this repo.

---

## 2. Reproduce (main, fake-cloud, board only)

**Profile:** persist `localStorage` across navigations (do **not** use `isolatedCloudContext` — its `addInitScript` clears storage on **every** navigation and masks the bug/design).

```bash
git checkout main
npm ci
npx playwright install chromium
npx playwright test tests/e2e/board-bind-url-store-mismatch-repro.spec.mjs
```

**Spec:** `tests/e2e/board-bind-url-store-mismatch-repro.spec.mjs`  
**Expected:** **PASS** — after `zz-qa-store-a` then `a17`, `milksha:board-bind-record.storeId` stays `zz-qa-store-a`; second boot `boardAutoPairReadCount ≥ 1`, `boardAutoPairInitialCount` still `1`; hint text contains `zz-qa-store-a`, not `a17`.

---

## 3. Same on PR #105?

**Yes.** Diff `origin/main` vs `origin/cursor/store-id-rule-de1b` for `js/board/board-auto-pair-host.js` `runPair()` / `hasBindRecord` branch: **no logic change** (only optional `storeNumber` normalization on **initial** path). Repro above applies to both.

---

## 4. If product treats QA expectation as desired (URL should win) — ranked options

*Not implemented; verification ideas only.*

| Rank | Option | Behavior | STB / field risk |
|------|--------|----------|------------------|
| 1 | **URL store wins** — if `normalize(URL.store) !== record.storeId`, clear bind record (or skip read path) and run **initial** pair for URL store | Matches per-store URL plan; fixes QA | **Medium** — wrong bookmark could re-bind device to another store without operator knowing; needs clear UX |
| 2 | **Keep bind, block mismatch** — read path as today; show full-screen / banner “URL 店號與已綁定店號不同，請清除網站資料或掃描正確 QR” | Safe for deployed boxes; explains confusion | **Low** — STBs stay on correct store; operators must clear data to switch |
| 3 | **Manual unbind** — settings / long-press “解除綁定” clears `milksha:board-bind-record` then initial pair from URL | Explicit operator intent | **Low–medium** — training burden; avoids silent wrong-store |
| 4 | **Session-scoped bind** — bind record in `sessionStorage` only (APK restart clears) | APK relaunch picks URL; browser tab reuse still sticky | **High** — browser QA unchanged; STB-only partial fix |
| 5 | **Ignore URL when bound** (status quo) | #97 as shipped | **Low** risk, **high** confusion when users change query string without clearing data |

**Verify option 1:** extend repro spec to assert initial count `2` and `record.storeId === 'a17'` after second URL (would fail today).  
**Verify option 2:** add E2E expecting visible mismatch copy (none today).  
**Verify option 3:** manual test after hypothetical button — `localStorage.removeItem('milksha:board-bind-record')` then reload.

---

## 5. Customer workaround (plain language)

- **若要換店：** 在瀏覽器或 APK 看板裡 **清除此網站的資料**（Chrome：網站設定 → 儲存空間 → 清除；Android WebView／App 通常等同清除 App 儲存或依 IT 流程），再開啟 **正確 QR／連結**（含目標 `?store=`）。
- **不要**只改網址列店號卻保留舊資料 — 系統會記住**第一次配對成功的店**，之後開機只「確認舊綁定」，不會依新網址自動換店。
- 現有版 **沒有**「解除綁定」按鈕；清除站存是唯一可靠換店方式。

---

## 6. PR / deliverable

- Draft PR from `cursor/board-store-switch-diag-de1b` — **report + repro spec only**; do not merge with #105 product changes.
