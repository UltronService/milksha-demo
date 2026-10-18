# PR #98 — CI 紀錄

- **PR:** https://github.com/UltronService/milksha-demo/pull/98
- **Head:** `1990c1b`
- **main 基準 36 項：** [39105020723](https://github.com/UltronService/milksha-demo/actions/runs/39105020723) / `main-baseline-failures-39105020723.txt`
- **PR #100：** 已關閉

## 分支獨有失敗 — 根因（REPORT §1）

| 測試 | 類別 | 處置 |
|------|------|------|
| `controller-actions` ×3 | zone + **清空 modal** | ✅ harness `confirmClearBoardModal` + `expandControllerZone(sec-pos)`（39107988748 已不列失敗） |
| `screenshots` / `pr-review-screenshots` | zone helper | ✅ 已綠 |
| `pr23` 5 min | **shard 污染** fake-cloud `devLogin` | `restartCloud` + **獨立 job** `e2e-pr23-login-rate`（matrix `--grep-invert`） |
| `cloud-remote-send` ten sends | **非 zone**（`sec-quick-send` 恆展開）；與 main 同 send 邏輯 | 僅 `btn-clear-now` 改 helper；send 仍 main 原樣；CI 仍紅待觀察 |

## 38 spec 證明

- 37 檔互動僅 helper 替換 + `controller-zone-expand-guard.spec.mjs` 新檔；`cloud-remote-send` 僅 +1 import、clear 一行 helper。
- 驗證：`scripts/verify-e2e-zone-spec-diff.mjs`（import 重排用 `git diff origin/main -- tests/e2e` 人工對照）。
- **已刪** `apply-controller-zone-clicks.mjs`。

## 最新 CI — [39108756283](https://github.com/UltronService/milksha-demo/actions/runs/39108756283)

| 項目 | 值 |
|------|-----|
| 牆鐘 | **~9m 39s**（≤15m ✓） |
| 最慢 shard | e2e (19) **~9m 35s**（≤10m ✓；PR23 已拆至 `e2e-pr23-login-rate`） |
| 失敗 ⊆ main 36？ | **否** — 仍含 **pr23**（獨立 job 亦紅）、**cloud-remote-send ten sends**；**controller-actions** 已綠 |
| 24 shard + PR23 job | 已啟用 |
