# CI nightly split — implementation report

- **PR:** https://github.com/UltronService/milksha-demo/pull/98
- **Head commit:** `6ac3e32` (`fix(ci): shard Playwright via testDir; testIgnore live-cloud specs`)
- **整體 CI 結論（最新 run）：** **不通過**（unit 綠；e2e 多 shard 失敗或 15m 逾時）
- **最新 CI run：** https://github.com/UltronService/milksha-demo/actions/runs/39095700095
- **完成時間（台北）：** 2026-10-18 12:17

## PR CI 耗時（run `39095700095`）

| Job | 結果 | 耗時（約） |
|-----|------|------------|
| unit | success | 1m 53s |
| e2e (1) | failure | 8m 14s |
| e2e (2) | failure | 11m 40s |
| e2e (3) | failure | 7m 6s |
| e2e (4) | cancelled（15m 逾時） | 15m 18s |
| e2e (5) | cancelled（15m 逾時） | 15m 16s |
| e2e (6) | failure | 14m 20s |
| e2e (7) | cancelled（15m 逾時） | 15m 4s |
| e2e (8) | cancelled（15m 逾時） | 15m 17s |
| **Workflow 牆鐘** | failure | **~15m**（符合 15m 上限，但 e2e 未全過） |

## Nightly workflow

- **檔案：** `.github/workflows/ci-nightly.yml`（cron `0 20 * * *` UTC = 04:00 台北；`workflow_dispatch`；`LIVE_CLOUD_STORE_ID: zz-qa-ci-store`；含 4 支 live-cloud spec）
- **手動觸發：** Cloud Agent token **403**，無法 `workflow_dispatch`；需合併至 `main` 後由負責人在 Actions 手動跑，或授權 `actions:write`
- **預期：** 與 main 相同 2 項 live-cloud 失敗為已知；本次未驗證執行結果

## PLAN 七條 ↔ 測試／實作

| # | 項目 | 狀態 | 對應 |
|---|------|------|------|
| 1 | PR 僅本機／假雲端；守門 | 已實作 | `tests/ci-test-tier-manifest.json`、`tests/ci-test-tier-assignment.test.js`、`tests/ci-pr-workflow-guard.test.js`、`MILKSHA_CI_TIER=pr`、`installPrTierNetworkGuard`（經 `installBundledCloudRouteShim`） |
| 2 | Live cloud 移 nightly | 已實作 | `.github/workflows/ci-nightly.yml`；`ci.yml` 已移除 `e2e-live-cloud` |
| 3 | PR ≤15m：shard + 瀏覽器快取 | 部分 | 8 shard 平行 + `~/.cache/ms-playwright` cache + job `timeout-minutes: 15`；牆鐘 ~15m，**e2e 仍失敗**（慢測試分片不均／部分 spec 失敗） |
| 4 | 測試檔完整指派 | 已實作 | `tests/ci-test-tier-assignment.test.js`（含 `home-board-auto-pair-live-cloud.spec.mjs` → nightly） |
| 5 | cpSync `.git` ENOENT | 已實作 | `scripts/lib/copy-site-for-playwright.mjs`、`tests/site-copy-for-playwright.test.js`；column/official layout 改用唯一 tmp |
| 6 | 不改 board/controller 產品碼 | 符合 | 僅 workflow、playwright.config、`tests/e2e/harness.mjs`、scripts/tests 守門 |
| 7 | Playwright 先於 `npm test` | 已保留 | `ci.yml` unit job；`tests/ci-pr-workflow-guard.test.js` |

## 本機驗證

- `npx playwright install chromium` 後 `npm test`：**334 passed**（含新守門／指派／site-copy 測試）

## 後續建議（未實作）

- 將 e2e shard 增至 **12** 或對 `home-board-background-6min` / `pr23-login-count` 做 **shard 平衡**（仍不移到 nightly）
- 調查 run `39095700095` 各 shard 失敗 spec（非僅 15m cancel）
- 合併後由負責人觸發 nightly 並確認僅 2 項已知失敗
