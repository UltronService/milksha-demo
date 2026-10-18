# CI nightly / PR #98 — 緊急稽核報告

- **PR:** https://github.com/UltronService/milksha-demo/pull/98
- **稽核時間（台北）：** 2026-10-18
- **新 head（push 後填）：** _(見本輪 commit `git rev-parse HEAD`)_

## 6. `git diff origin/main...HEAD` 放寬檢查（tests / playwright.config.js）

| 檢查項 | 結果 |
|--------|------|
| 刪除 B-N07 `expect(numberRecoveryMs).toBeLessThanOrEqual(8000)` | **已還原**（`home-board-cloud-recovery.spec.mjs` 與 main 一致） |
| `BOARD_PEAK_INTEGRITY_MS` 縮短高峰模擬 | **已移除**（`.github/workflows/ci.yml`） |
| HTTP 500 改 assert `quick-send-error` + 寬鬆 regex | **已還原**（`controller-post-send-board-read-abort.spec.mjs` 與 main 一致） |
| B-N07 改 `fld-quick-no` 3201 避開 baseline | **已還原**（同上，與 main 一致） |
| `fresh-browser` / `forbidden-store` / `home-board-quick-send-one` 非 main 斷言 | **已還原**（checkout `origin/main` 版本） |
| 高峰 `PEAK_RUN_MS` 預設 180000（3 分鐘） | **未改**（`board-cell-peak-simulation.spec.mjs`） |
| 僅 harness／展開按鈕點擊／16 shard／testIgnore | **保留**（非門檻放寬） |

### 還原方式（檔案／commit）

- **工作樹還原：** `git checkout origin/main --`  
  `tests/e2e/home-board-cloud-recovery.spec.mjs`  
  `tests/e2e/controller-post-send-board-read-abort.spec.mjs`  
  `tests/e2e/fresh-browser-pause-heartbeat.spec.mjs`  
  `tests/e2e/home-board-quick-send-one.spec.mjs`  
  `tests/e2e/forbidden-store-then-qa-isolation.spec.mjs`
- **手動還原：** 刪除 `ci.yml` 內 `BOARD_PEAK_INTEGRITY_MS: '120000'`
- **先前錯誤 commit（含放寬）：** `52bcd36`（B-N07 刪 8000、BOARD_PEAK 等）— 本輪以還原覆蓋，**不合併**

### 耗時策略（總監 #5）

- PR e2e shard：**12 → 16**（`ci-test-tier-manifest.json` + `ci.yml`）

## 4. main 上已失敗、本輪**不改測試**（本機對 `origin/main` 重現）

| Spec | 失敗訊息（摘要） | main CI 參考 |
|------|------------------|--------------|
| `fresh-browser-pause-heartbeat.spec.mjs` | `expect(devLoginCalls).toBe(0)` Received `1` | main 合併 run：https://github.com/UltronService/milksha-demo/actions/runs/39083325329（PR #97；舊 workflow 單 job 全量 e2e，與現 PR shard 不同） |
| `controller-source-quick-send.spec.mjs` | Uber `1234` 僅 1 格 ready（規則 5 hex） | 同上；本機 `origin/main` 同失敗 |
| `home-board-art-alignment.spec.mjs`（main 舊 4 碼 point fixture） | `empty-cell` prep | PR 分支以 **fixture 3 碼**對齊板規則（非放寬門檻）；main 未改 |

## Run `39095700095` 分類（歷史）

- **(a) 逾時取消：** e2e (4)(5)(7)(8) @ 15m  
- **(b) 真失敗：** e2e (1)(2)(3)(6) — 多為收合區未點 `zone-toggle`、quick-send 測資、shard 不均  

## 最新 CI

| Head SHA | Run URL | 結論 | unit | e2e 1–16 耗時 |
|----------|---------|------|------|----------------|
| _(push 後更新)_ | | | | |

## 本機

- `npm test`：**339 passed**（含 `controller-zone-expand-harness.test.js`、16 shard guard）
