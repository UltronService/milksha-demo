# PR #98 — CI 紀錄（最新）

- **PR:** https://github.com/UltronService/milksha-demo/pull/98
- **量測 PR #100:** 已關閉（不合併）；main 基準 run [39105020723](https://github.com/UltronService/milksha-demo/actions/runs/39105020723)，**36** 項失敗清單見 `main-baseline-failures-39105020723.txt`

## 分支獨有失敗 — 根因（結構化）

| 測試 | 主因類別 | 說明 | 處置 |
|------|----------|------|------|
| `controller-actions` tammy / special clear ×3 | **zone-toggle + harness 互動** | 主 harness 移除「連線後自動展開全部 zone」；`btn-clear-now` 需確認 modal；`btn-gen-normal` 需 `sec-pos` 展開 | harness `confirmClearBoardModal`；spec `expandControllerZone(sec-pos)`；clear 用 helper |
| `cloud-remote-send` ten sends | **zone-toggle 套用範圍** | `sec-quick-send` 無收合 toggle，**不應**對 `btn-send-numbers` 走 helper（與 main 同 raw click）；clear 走 helper + modal | send 維持 `controller.click`；clear 用 `clickControllerDevButtonByTestId` |
| `pr23-login-count` 5 min | **shard／fake-cloud 狀態** | 同 shard 長測污染 `devLogin` 計數（非 assertion）；非 copy-site／tier guard | `beforeEach` 加 `restartCloud()`（仍 `resetCloudState`） |
| `pr-review-screenshots` / `screenshots`（39103705479） | **zone-toggle 套用** | 收合區內 `fill`/`click` 未展開；非 shard | 已改 `fillControllerDevField` + `clickControllerDevButton*`（39105013482 已綠） |

**排除：** copy-site 單測、`installPrTierNetworkGuard`（PR 未掛載到 page）、tier manifest 未改測試邏輯。

## 38 spec 變動證明（僅互動 helper）

- 對 `origin/main` 共 **37** 個既有 `*.spec.mjs` 變更 + 新檔 `controller-zone-expand-guard.spec.mjs`（回歸，非 bulk 腳本產物）。
- 互動替換僅：`clickControllerDevButton*`、`fillControllerDevField`、`selectControllerDevField`、少數 `expandControllerZone`；**無** `expect`／timeout／測資變更（`pr23` 僅多 `restartCloud()` 隔離）。
- 驗證：`node scripts/verify-e2e-zone-spec-diff.mjs`（import 重排需人工對照 `git diff`）；**已刪**一次性 `apply-controller-zone-clicks.mjs`。

## CI 設定

- **24 shard**（目標最慢 job ≤10m、牆鐘 ≤15m）
- Head：見最新 push

## 待填（push 後）

| 項目 | 值 |
|------|-----|
| Run URL | _pending_ |
| 牆鐘 | _pending_ |
| 最慢 shard | _pending_ |
| 失敗 ⊆ main 36？ | _pending_ |
