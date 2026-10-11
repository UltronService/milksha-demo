# Live cloud: multiple `applyPayload` per controller send

**Store:** `zz-qa-ci-store` only (never `zz-qa-store-a`). **Debugging only — no fix in this branch.**

## Reproduce

```bash
# Fake cloud baseline
node scripts/fade-stuck-payload-count-probe.mjs --mode fake

# Real cloud (branch-routed board JS optional; counts board-side applyPayload)
LIVE_CLOUD_STORE_ID=zz-qa-ci-store node scripts/fade-stuck-payload-count-probe.mjs --mode live
```

Hook installed after board online; each controller click on `[data-testid="btn-send-numbers"]` waits ~800ms then reports `applyDelta` on the board page.

### Sample (2026-10-11)

| Send # | fake `applyDelta` | live `applyDelta` |
|--------|-------------------|-------------------|
| 1 | 1 | 1 |
| 2 | 2 | 1 |
| 3 | 1 | 1 |
| 4 | 1 | 1 |
| 5 | 1 | 1 |

Earlier fade-stuck session saw live **send 2 ≈ 5** applies in 800ms; this run was **1** per send (store/load dependent). Treat counts as **time-series evidence**, not a fixed constant.

## Hypotheses (ranked)

1. **Firestore/RTDB today_board listener delivers the same logical update more than once** (initial snapshot + patch + echo). **Verify:** log listener callback count with seq/version on board; correlate one controller POST with N cloud writes in Functions logs.

2. **Multiple board subscribers or tabs on the same store/device** each write path triggers a shared fan-out so one send produces several identical payloads to one board tab. **Verify:** ensure single board tab; check `devices/*/heartbeat` and duplicate `today_board` listeners in network/MCP trace.

3. **Controller send triggers both optimistic local echo and cloud round-trip apply on the board** (transport + poll refresh). **Verify:** compare apply count with board-only cloud vs controller+board; timestamp `applyPayload` args and diff silent vs animated applies.

4. **Fake cloud coalesces writes in `server.mjs` while production Cloud Functions emit separate prep+ready or multi-ticket frames**. **Verify:** capture raw `number_content` length per callback on live vs fake for one btn-send-numbers.

5. **Concurrent CI / other agents writing `zz-qa-ci-store` during probes inflates apply count intermittently** (not the user's single-send case). **Verify:** run probe in a quiet window; cross-check GitHub Actions timeline when send-2 delta spikes.

## Next steps (investigation)

- Add board-side counter export in probe JSON (payload lengths, silent flag, skip reason).
- Trace receiver cloud path from `today_board` doc change → `applyPayload` (no product behavior change).
