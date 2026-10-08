# PR #27 post-merge QA failure — investigation (2026-10-08)

## One-line verdict

**QA 腳本問題**（Playwright `waitForFunction` 參數誤用 + `STORE_MAIN` 未注入），不是 s999999「連線暫停」跨店污染；公開雲端 zz-qa 偶發收號延遲會放大腳本誤判為 120s 逾時。

## Evidence

### 1. Not cross-store 403 / pause pollution

- Same-context probe **d → zz-qa c×3**: 2/3 full pass, failures had `#milksha-cloud-paused` **hidden**, `sessionHalted: false`, no `milksha:auth:devlogin-peer:*` lock stuck.
- s999999 tab after real `devLogin` **403**: pause UI on; `localStorage` auth keys for s999999 **not** required for zz-qa tabs to connect (`readyMs` ~2s).
- Product: `accessDenied403` lives only in **per-tab** `createAuthSession` memory (`js/transport/auth-session.js`), **not** persisted in localStorage.

### 2. QA script bugs (from agent `run-pr27-live-qa.mjs`)

| Issue | Symptom | Fix |
|--------|---------|-----|
| `waitForFunction(() => fld.value === STORE_MAIN)` without passing `STORE_MAIN` | Check **b** `ReferenceError`, false FAIL | Pass store id as 2nd arg |
| `waitForFunction(fn, { timeout: 60000 })` — options object taken as **predicate arg** | Default **120s** timeout; check **c** round 3 looks like「連線暫停卡住」 | Use `waitForFunction(fn, undefined, { timeout })` |
| `clear_now` asserted via controller log only | Board still showing numbers → send/isolation flake | Wait until board `.milksha-ready` count === 0 |

### 3. Intermittent real cloud (secondary)

Investigation runs (`artifacts/pr27-investigate/report.json`): fresh **c-only** 1/3 pass; failures often `aCount: 0` with `sendAMs ~500ms` and **no pause UI** — send acknowledged path fast but board empty at recount (cloud poll / race), not 403 halt.

## Corrected automation

- `scripts/public-pages-pr27-live-qa.mjs` — full fresh + legacy-key a–e on public URL
- `scripts/public-pages-pr27-investigate.mjs` — repro + d→c probes
- E2E: `tests/e2e/forbidden-store-then-qa-isolation.spec.mjs`

## QA agent log reference

Uploaded jsonl documents PR #27 run: fresh **c** FAIL 120s on authoritative rerun; fresh **d/e** PASS; legacy **c** PASS.

## Backend devLogin volume (10/3–10/8, ~3,500 POST)

- Cloud Run 紀錄 5,058 筆（含 1,432 OPTIONS 204）；POST 3,481、120 個 IP（AWS，Cursor 雲端 QA VM），UA HeadlessChrome/131。
- referer：`127.0.0.1:8877` 約 2,500、公開 Pages 約 2,200（同一批代理人腳本）。
- 10/8 00:00–01:00 台北約 1,500 筆：少數 IP 長時間存在、**短爆發**非每 3 秒長串。
- 真人 Mac（118.150.195.4）僅 10/7 06:10–06:14 約 100 次（PR #23 舊 bug），之後每開頁 1–4 次。

### Live count on public URL (`scripts/public-pages-devlogin-count.mjs`)

| 情境 | 觀察窗 | devLogin（idle 期間） | 備註 |
|------|--------|----------------------|------|
| 全新瀏覽器 `s999999` →「連線暫停」 | 暫停後 **5 分鐘** | **0**（進頁僅 1 次 POST→403） | 無重試迴圈 |
| 正常 `zz-qa-store-a` 看板＋控制端 | 連線就緒後 **10 分鐘** | **0**（就緒前 2 次） | token 存活內不重登 |

**一句結論（登入量 vs 卡住）：** 10/3–10/8 devLogin 偏高是 **Cursor 自動測試大量重跑**（多 IP、短爆發、8877+公開雙 referer），與產品在「連線暫停」或正常 idle 下的 devLogin **不是同一原因**；QA 卡 120s 主因是 **腳本 waitForFunction 參數錯誤**＋雲端偶發收號，非 devLogin 迴圈。

產物：`artifacts/pr27-devlogin-count/report.json`
