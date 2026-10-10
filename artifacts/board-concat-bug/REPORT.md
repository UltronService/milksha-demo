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

| Build | SHORT repro | 說明 |
|-------|-------------|------|
| **main** anim/board | **FAIL** `reproduced=true` | [qa-repro-main-short.log](./qa-repro-main-short.log) |
| **fix** branch | **PASS** `reproduced=false` | `artifacts/board-concat-bug/qa-repro/results.json` |

**15min peak + 15min normal（含 bg/fg）** 全量跑：`artifacts/board-concat-bug/qa-repro-15m.log`（tmux 進行中／完成後更新結論）

## Unit / e2e

| 項目 | 結果 |
|------|------|
| `npm test` | 185/185 pass |
| `verify-concat-tests-main-vs-branch.mjs` | main unit+e2e FAIL / fix PASS |
| `board-cell-single-number.spec.mjs` | 6/6 pass |
| `playwright test tests/e2e` | 見 CI |

## Commit / CI

- Branch: `cursor/fix-board-concat-numbers-a2ca`
- PR: https://github.com/UltronService/milksha-demo/pull/39
- **SHA:** _(push 後填入)_
- **CI:** _(green 後填入 run URL)_

## CI 綠燈 ETA（台北）

以 **18:05 台北** 推估：CI 含 3min peak + live cloud 長測，全量 e2e 約 **35–50 分** → 預估 **18:40–18:55 台北** 綠燈（若排隊更久可能接近 **19:00**）。15min×2 本地 QA 約 **18:35** 可讀 log。

## Manual UAT

1. 合併後公開站 zz-qa-store-a 尖峰 5 分鐘：準備區每格單號。
2. 準備中 >10 等翻頁：第 2 頁無黏號。
3. 看板分頁切背景 1 分鐘再回：無永久殘留半透明號碼。
