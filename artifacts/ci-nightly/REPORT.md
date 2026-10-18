# PR #98 — CI / QA 紀錄

- **PR:** https://github.com/UltronService/milksha-demo/pull/98
- **Head:**（見最新 push）
- **main 36 項基準：** [39105020723](https://github.com/UltronService/milksha-demo/actions/runs/39105020723)

## 可重現命令（總監 §1）

```bash
# 本機 CI-like（與 Actions 相同 env）
export MILKSHA_CI_TIER=pr CI=1
export FONTCONFIG_FILE="$PWD/tests/e2e/fonts/fontconfig-e2e.conf"

# origin/main ×3（腳本會建 worktree + 套用 testIgnore）
./scripts/repro-main-triple-spec.sh cloud-remote-send
./scripts/repro-main-triple-spec.sh pr23-login-count   # 每次 ~5min

# 本分支（同命令，在 repo 根目錄）
npx playwright test tests/e2e/cloud-remote-send.spec.mjs -g "ten sends produce ten numbers"
npx playwright test tests/e2e/pr23-login-count.spec.mjs -g "5 min normal board idle"

# GitHub Actions（main @ ref main，各 3 次）
# workflow: .github/workflows/ci-main-spec-triple-probe.yml
gh workflow run ci-main-spec-triple-probe.yml --ref cursor/ci-npm-test-playwright-order-ce9c
```

### 本機 main ×3（cloud-remote-send ten sends）

| Run | 結果 | 證據 |
|-----|------|------|
| 1–3 | **FAIL**（Timeout 5000ms，`length === n`） | `artifacts/ci-nightly/main-triple-repro-cloud-remote-send/run-{1,2,3}.log` |

本機與 CI 可能不一致；**以 Actions `ci-main-spec-triple-probe` 為準**（見下節待填）。

### 分支獨有 — 假設排序（§2）

| # | 假設 | 依據 |
|---|------|------|
| 1 | **spec 偏離 main**（`restartCloud` 疊加、clear helper） | 已還原 `pr23` / `cloud-remote-send` 與 `origin/main` 一致 |
| 2 | **harness `connectController` / zone 展開** 改變全站 controller 預設 UI | 兩 spec 未呼叫 `connectController`；影響間接 |
| 3 | **`expandControllerZone` DOM 點擊 vs 舊 evaluate 強開** | 僅影測其他檔；此二檔已同 main |
| 4 | **shard / fake-cloud 計數污染**（pr23 `devLogin`） | 獨立 job 仍紅 → 待 triple main 對照 |
| 5 | **playwright `testIgnore` live-cloud** | main probe workflow 會注入，與 PR tier 一致 |

## QA 驗收對照（總監 §2）

| 條目 | 證據 |
|------|------|
| **(a) 牆鐘 ≤15 分** | [39108756283](https://github.com/UltronService/milksha-demo/actions/runs/39108756283) workflow **~9m 39s** |
| **(b) 每檔 PR 或 nightly** | `npm test` → `tests/ci-test-tier-assignment.test.js`（`every test file is assigned to exactly one of PR or nightly tiers`） |
| **(c) PR 不連真雲** | `tests/ci-pr-tier-guard.test.js`（無 `e2e-live-cloud`、無 `LIVE_CLOUD_STORE_ID`）；`harness.mjs` 定義 `installPrTierNetworkGuard`（靜態） |
| **(d) 失敗沒比 main 多** | 對照 [39105020723](https://github.com/UltronService/milksha-demo/actions/runs/39105020723) 36 項；分支曾多 **pr23**、**cloud-remote-send**（spec 已還原 main，待最新 CI） |
| **(e) 展開後 toBeVisible** | 單元：`tests/controller-zone-expand-harness.test.js`；e2e：`tests/e2e/controller-zone-expand-guard.spec.mjs`（`POS add-ticket stays hidden…` / `after expandControllerZone clicks, add-ticket is visible`） |

## 最新 PR CI

| 項目 | 值 |
|------|------|
| Run | _pending push_ |
| 最慢 shard | 目標 ≤10m（24 shard + PR23 獨立 job） |
| 失敗 ⊆ main 36？ | _pending_ |

## main triple probe（Actions）

| Spec | Run 1 | Run 2 | Run 3 | 連結 |
|------|-------|-------|-------|------|
| cloud-remote ten sends | _pending_ | _pending_ | _pending_ | workflow `ci-main-spec-triple-probe` |
| pr23 5 min | _pending_ | _pending_ | _pending_ | 同上 |

若任一次 main 失敗 → 列入 main 既有（不擋 PR）；3/3 過 → 分支必修（已還原 spec + 待 CI 驗證）。
