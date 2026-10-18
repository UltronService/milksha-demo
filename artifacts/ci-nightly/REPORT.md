# PR #98 — 測試自查與 CI 紀錄

- **PR:** https://github.com/UltronService/milksha-demo/pull/98
- **Head：** `2e16c43218216807ddafc121ed378e6428e65720`

## 2. `origin/main...HEAD` 測試檔變動清單（僅允許項）

| 檔案 | 類別 |
|------|------|
| `playwright.config.js` | `testIgnore` live-cloud |
| `tests/e2e/harness.mjs` | zone-toggle 展開、`toBeVisible` 後操作、`connectController` 可見點擊 |
| `tests/e2e/controller-zone-expand-guard.spec.mjs` | 回歸：未展開點擊必失敗 |
| `tests/controller-zone-expand-harness.test.js` | 回歸：禁止 DOM 強開 zone |
| `tests/ci-pr-tier-guard.test.js` | CI tier guard |
| `tests/ci-pr-workflow-guard.test.js` | CI workflow guard |
| `tests/ci-test-tier-assignment.test.js` | tier 指派 |
| `tests/ci-test-tier-manifest.json` | manifest（16 shard） |
| `tests/site-copy-for-playwright.test.js` | copy-site |
| `tests/playwright-check-cleanup-regression.test.js` | npm test / Playwright 順序 |
| `tests/fixtures/playwright-launch-failure-*.harness.mjs` | column/official layout 清理 |

**已還原為 main（含測資／assertion）：** 所有其他 `tests/e2e/*.spec.mjs`（含 `controller-source-quick-send.spec.mjs`）、`board-ref-fixtures.mjs`；刪除 `e2e-controller-quick-send-uber-format.test.js`、`board-ref-fixtures-point-digits.test.js`。

## 4. main 既有失敗（不改測試，僅列證）

| 測試 | 失敗摘要 | 證明 |
|------|----------|------|
| `controller-source-quick-send.spec.mjs` | `toHaveCount(2)` 只得 1；Uber `1234` 非 5 hex | 本機 `origin/main` 同失敗 |
| `fresh-browser-pause-heartbeat.spec.mjs` | `devLoginCalls` 期望 0、得 1 | 本機 `origin/main` 同失敗 |
| `home-board-art-alignment.spec.mjs` | prep `empty-cell`（main fixture 4 碼 point） | 本機 main 同失敗 |
| main `e2e-live-cloud` | live-cloud 2 項 | https://github.com/UltronService/milksha-demo/actions/runs/39083325329 job `e2e-live-cloud` |

## 3. 最新 PR CI（16 shard）

| 項目 | 值 |
|------|-----|
| Run URL | |
| Head SHA | |
| Workflow 牆鐘 | |
| 最慢 shard | |
| 結論 | |
| 失敗是否皆在「main 既有」清單 | |

## 策略

- e2e **16 shard**，job timeout 15m；**不合併**；**不放寬**任何 assertion／timeout／時長。
