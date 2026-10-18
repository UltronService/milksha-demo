# PR #98 — CI 紀錄

- **PR:** https://github.com/UltronService/milksha-demo/pull/98
- **Head:** `8541ddb`（+ PR23 獨立 job 待下一 run）
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

## 最新 CI — [39107988748](https://github.com/UltronService/milksha-demo/actions/runs/39107988748)

| 項目 | 值 |
|------|-----|
| 牆鐘 | **~11m 07s** |
| 最慢 shard | e2e (23) **~11m 03s**（含 PR23 5min） |
| 失敗 ⊆ main 36？ | **否** — 另 **pr23**、**cloud-remote-send ten sends**（其餘多為 main 36 內） |
| 24 shard | 已啟用 |
