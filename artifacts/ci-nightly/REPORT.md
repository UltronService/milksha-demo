# PR #98 — CI / QA 紀錄

- **PR:** https://github.com/UltronService/milksha-demo/pull/98
- **Head:** `63f600c`（`cursor/ci-npm-test-playwright-order-ce9c`）
- **參考 PR CI：** [39109845340](https://github.com/UltronService/milksha-demo/actions/runs/39109845340) — workflow **failure（紅燈）**；**18** 個唯一 e2e 失敗 ⊆ main 既有 **38** 項；**分支獨有 0**
- **main 36 項基準：** [39105020723](https://github.com/UltronService/milksha-demo/actions/runs/39105020723)（清單見 `main-baseline-failures-39105020723.txt`，含 addendum +2）

## 總監 §1 — main 單 spec ×3（同 CI 環境）

Workflow：[39109842876](https://github.com/UltronService/milksha-demo/actions/runs/39109842876)（checkout **`ref: main`**，`MILKSHA_CI_TIER=pr` + `testIgnore` live-cloud）

| Spec | Run 1 | Run 2 | Run 3 | 結論 |
|------|-------|-------|-------|------|
| **cloud-remote-send** — `ten sends produce ten numbers and clear works` | FAIL | FAIL | FAIL | **main 既有**（不擋 PR） |
| **pr23-login-count** — `5 min normal board idle` | FAIL | FAIL | FAIL | **main 既有**（不擋 PR） |

證據（失敗訊息）：

1. **cloud-remote-send**（3/3 相同）  
   `TimeoutError: page.waitForFunction: Timeout 5000ms exceeded` — 等待 `.milksha-ready .milksha-num` 數量 `=== n`  
   - Job 範例：[cloud-remote-ten-main (1)](https://github.com/UltronService/milksha-demo/actions/runs/39109842876/job/117623395484)

2. **pr23 5 min**（3/3 相同）  
   `expect(counts.devLogin).toBeLessThanOrEqual(4)` — **Received: 101**  
   - Job 範例：[pr23-five-min-main (1)](https://github.com/UltronService/milksha-demo/actions/runs/39109842876/job/117623395605)

已列入 `main-baseline-failures-39105020723.txt` **ADDENDUM**；分支 spec 已與 `origin/main` 一致，**不需**為此二項放寬 / skip / 改 assertion。

### 可重現命令

```bash
export MILKSHA_CI_TIER=pr CI=1
export FONTCONFIG_FILE="$PWD/tests/e2e/fonts/fontconfig-e2e.conf"
./scripts/repro-main-triple-spec.sh cloud-remote-send
./scripts/repro-main-triple-spec.sh pr23-login-count
gh workflow run ci-main-spec-triple-probe.yml --ref cursor/ci-npm-test-playwright-order-ce9c
```

本機 main worktree ×3（cloud-remote）：`artifacts/ci-nightly/main-triple-repro-cloud-remote-send/run-{1,2,3}.log`（同 Timeout 5000ms）。

## QA 驗收對照（總監 §2）

**說明：** 下表「驗收符合」指 (a)–(e) 條款對照結果；**不等於** GitHub Actions workflow 全綠。證據 run [39109845340](https://github.com/UltronService/milksha-demo/actions/runs/39109845340) 結論為 **failure（紅燈）**（12 個 failed job），與 main 既有失敗清單對照後 **分支獨有 0**。

| 條目 | 結果 | 證據 |
|------|------|------|
| **(a) 總時間 ≤15 分** | **驗收符合** | 同上 run 牆鐘 **11m 13s**（紅燈 run，僅量牆鐘）；同分支較早 run [39108756283](https://github.com/UltronService/milksha-demo/actions/runs/39108756283) 亦 **failure**，牆鐘 **9m 39s** |
| **(b) 每測試檔 PR 或 nightly** | **驗收符合** | `node --test tests/ci-test-tier-assignment.test.js` — `every test file is assigned to exactly one of PR or nightly tiers`；`tests/ci-test-tier-manifest.json` → `e2eShardCount: 24` |
| **(c) PR 不連真雲** | **驗收符合** | `tests/ci-pr-tier-guard.test.js`（`installPrTierNetworkGuard`、`firestore.googleapis.com` shim）；`tests/ci-pr-workflow-guard.test.js`（`ci.yml` 無 `e2e-live-cloud` job） |
| **(d) 失敗沒比 main 多** | **驗收符合** | run 39109845340：**18** 個唯一失敗 ⊆ baseline **38**（36 + addendum 2）；**分支獨有 0**（見下表） |
| **(e) 展開後才 toBeVisible** | **驗收符合** | 單元：`tests/controller-zone-expand-harness.test.js`；e2e：`POS add-ticket stays hidden until zones are expanded by user toggle`、`after expandControllerZone clicks, add-ticket is visible to the user`（`tests/e2e/controller-zone-expand-guard.spec.mjs`） |

### (d) 對照 — PR [39109845340](https://github.com/UltronService/milksha-demo/actions/runs/39109845340) vs main baseline

| 指標 | 值 |
|------|-----|
| Baseline 唯一失敗（36 + pr23 + cloud-remote） | 38 |
| 本 PR run 唯一失敗 | 18 |
| `PR_failures ⊆ baseline` | **是** |
| 僅分支、不在 baseline | **0** |

本 run 失敗清單（spec + 標題，與 log 一致）：

- `board-cell-peak-simulation` — 3-min peak run…
- `cloud-qa-checklist` — network cable pull and restore…
- `cloud-remote-send` — ten sends produce ten numbers…（**main addendum**）
- `controller-post-send-board-read-abort` — push_numbers HTTP 500…
- `controller-source-quick-send` — store 1234 and uber 1234…
- `controller-store-picker` — new store appears within poll window…
- `controller-store-picker-evidence` — 3c two minutes devLogin…
- `forbidden-store-then-qa-isolation` — zz-deny-test 連線暫停…
- `fresh-browser-pause-heartbeat` — boxHeartbeat 403…
- `home-board-art-alignment` — landscape 1920 / 3840
- `home-board-cloud-recovery` — B-N07…
- `home-board-quick-send-one` — ten quick sends…
- `home-board-stale-storage` — stale cloud settings migrate…
- `home-board-ten-send-clear` — fresh context + 2× localStorage seeded variants
- `pr23-login-count` — 5 min normal board idle（**獨立 job + main addendum**）

## 最新 PR CI（證據 run，非全綠）

| 項目 | 值 |
|------|-----|
| Run | [39109845340](https://github.com/UltronService/milksha-demo/actions/runs/39109845340) |
| Workflow 結論 | **failure（紅燈）** |
| Workflow 牆鐘 | **11m 13s** |
| 最慢 e2e shard | **e2e (19)** ≈ **9m 31s**（571s） |
| 失敗 job 數 | 12（含 `e2e-pr23-login-rate`） |
| 失敗 ⊆ main baseline | **是**（見上） |

**說明：** `e2e-pr23-login-rate` 預期仍紅（main 上同 spec 3/3 失敗）；不視為本 PR 獨有回歸。

## 分支工作摘要（非測試放寬）

- 24 shard + PR23 獨立 job；harness zone 真實展開 + clear modal；`pr23` / `cloud-remote-send` spec 還原 main。
- **不合併。**
