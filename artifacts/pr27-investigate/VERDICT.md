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
