# fix(board): 每格只顯示一個號碼 — REPORT

## Root cause

見 [ROOT-CAUSE.md](./ROOT-CAUSE.md)。`syncZone` 在 slot 仍被淡出 chip 占用時 append 新 chip；page-turn 中斷、分頁切換、背景分頁亦會留下 orphan／雙 chip。

## Fix（#39 第二版）

| # | 問題 | 修復 |
|---|------|------|
| 1 | Page 2 五格黏號／翻頁中更新 | 每格 **reconcile** 預期 id；**中斷翻頁** → `hardRebuildSlotsFromCells` |
| 2 | 背景回前景 | `visibilitychange` → `commitBoardView({ silentApply, forceSnapshotSkip })` 全量重繪 |
| 3 | 淡出 callback 不觸發 | `scheduleChipFadeOutRemove` + **timeout 強制 remove**；`cancelAll` 清 float |
| 4 | 淡出占 slot | `detachChipFromSlotForFade` + 插入前 reconcile；跨區 **duplicate id 立即移除** |

**檔案：** `js/board/milksha-board-anim.js`、`js/milksha-board.js`  
**模擬器（PR #20 對齊）：** `validateTicketsForBoardPush` + host 送出前檢查（`controller/store-simulation.js`）

## QA repro script

`node scripts/run-bugconcat-repro.mjs`（本地 `mode=local`；公開站 `BUGCONCAT_PUBLIC=1`）  
快測：`BUGCONCAT_SHORT=1`（各 90s）

### main vs fix（SHORT）

| Build | SHORT repro | 說明 |
|-------|-------------|------|
| **main** anim/board | **FAIL** `reproduced=true` | [qa-repro-main-short.log](./qa-repro-main-short.log)（multi-chip-cell／黏號樣本） |
| **fix** branch | **PASS** `reproduced=false` | 同腳本本地 90s×2 |

### 15 min peak + 15 min normal（fake cloud，bg/fg ×4）

Runner：`qa-repro-15m` tmux，`base=http://127.0.0.1:8877`，**2026-10-10 10:03–10:33 UTC**（18:03–18:33 台北）。  
Log：[qa-repro-15m.log](./qa-repro-15m.log) · JSON：[qa-repro/results.json](./qa-repro/results.json)

| Scenario | Samples (1 Hz) | Violations | Max detached (run) | End detached | End orphan chips |
|----------|----------------|------------|--------------------|--------------|------------------|
| `peak-15m-bg` | 900 | **0** | 0† | 0† | 0† |
| `normal-15m-bg` | 900 | **0** | 0† | 0† | 0† |
| **Total** | **1800** | **0** | — | — | — |

†Acceptance run used runner v1 (no persisted end board read). Zero `FLAG` lines in log and empty `flagEvents`; `scripts/run-bugconcat-repro.mjs` now records `endSnapshot` / `maxDetachedFloatObserved` for future runs.

**Overall:** `reproduced=false`, tolerance **0**.

## Unit / e2e

| 項目 | 結果 |
|------|------|
| `npm test` | 185/185 pass |
| `verify-concat-tests-main-vs-branch.mjs` | main unit+e2e **FAIL** / fix **PASS** |
| `board-cell-single-number.spec.mjs` | 6/6 pass |
| `playwright test tests/e2e` | **188 passed**（CI run `38046671066`；page-turn e2e 修於 `b5d981b`） |

## Commit / CI

- Branch: `cursor/fix-board-concat-numbers-a2ca`
- PR: https://github.com/UltronService/milksha-demo/pull/39
- **SHA:** `0d3fbd9c9e9c4dae412dac6228ae7c1e97c7d3ec`
- **CI:** https://github.com/UltronService/milksha-demo/actions/runs/38046671066 — **success**（completed 2026-10-10T11:38:31Z UTC）

## Manual UAT

1. 合併後公開站 zz-qa-store-a 尖峰 5 分鐘：準備區每格單號。
2. 準備中 >10 等翻頁：第 2 頁無黏號。
3. 看板分頁切背景 1 分鐘再回：無永久殘留半透明號碼。
