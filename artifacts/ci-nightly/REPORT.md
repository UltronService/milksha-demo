# PR #98 — 測試自查與 CI 紀錄

- **PR:** https://github.com/UltronService/milksha-demo/pull/98
- **Head：** `9afba1d`（zone-toggle spec 套用 + **20 shard**）

## main 基準（同一套 16 shard、PR tier、排除 live-cloud）

| 項目 | 值 |
|------|-----|
| 分支 / PR | `cursor/main-16shard-baseline-ce9c` — **PR #100**（僅量測，不合併） |
| Run URL | https://github.com/UltronService/milksha-demo/actions/runs/39105020723 |
| Base | `origin/main` @ `349d0b1`（無 harness／spec 變更） |
| Workflow 牆鐘 | **~15m 22s** |
| **main 失敗測試數（唯一項）** | **36**（清單見 `artifacts/ci-nightly/main-baseline-failures-39105020723.txt`） |

## run 39103705479 失敗項逐一標記（對照 main 基準 39105020723）

| 失敗測試（39103705479） | 標記 |
|-------------------------|------|
| `board-empty-hint-states` ×3、`board-empty-state`、`board-no-connection-ui` | **main 也失敗**（基準含 6 項同檔）；分支已用 zone helper **修到綠**（見 39105013482） |
| `board-cell-peak-simulation` 3-min peak | **main 也失敗** |
| `cloud-qa-checklist` ×2 | **main 也失敗** |
| `controller-post-send-board-read-abort` HTTP 500 | **main 也失敗** |
| `controller-source-quick-send` Uber 1234 | **main 也失敗** |
| `controller-store-picker` / `controller-store-picker-evidence` / `controller-store-simulation` ×2 | **main 也失敗** |
| `fresh-browser-pause-heartbeat` devLoginCalls | **main 也失敗** |
| `home-board-art-alignment` ×2 | **main 也失敗** |
| `home-board-clear-then-push-stale-command` | **main 也失敗** |
| `home-board-cloud-recovery` B-N07 + clear offline | **main 也失敗** |
| `home-board-quick-send-one` ten sends | **main 也失敗** |
| `home-board-stale-storage` cloud migrate | **main 也失敗** |
| `home-board-ten-send-clear` ×3 | **main 也失敗** |
| `main-5501-local-baseline` | **main 也失敗** |
| `pr-review-screenshots` | **只有分支失敗**（main 基準未列；39105013482 已綠） |
| `screenshots` | **只有分支失敗**（main 基準未列；39105013482 已綠） |
| `pr23-login-count` 5 min idle | **只有分支失敗**（main 基準未列；39105013482 仍紅） |
| e2e **(7)** job cancelled（逾時） | **未完整判定**（非單一測試） |

**39103705479 小結：** 列出的失敗中 **29 項可對應測試** → **26 main 也失敗**、**3 只有分支**（screenshots 系 + pr23）；empty-hint 系在 main 也失敗但分支已修。

## 最新 PR CI（20 shard）— run 39105013482

| 項目 | 值 |
|------|-----|
| Run URL | https://github.com/UltronService/milksha-demo/actions/runs/39105013482 |
| Head SHA | `9afba1d` |
| Workflow 牆鐘 | **~12m 55s**（≤15m ✓） |
| 最慢 shard | **e2e (19)** ≈ **11m 26s**（含安裝；目標 ≤10m 仍略超） |
| unit | success |
| e2e | failure（10 shard 紅） |
| 失敗是否 ⊆ main 基準 36 項 | **否** — 另含 **`controller-actions`**（3）、**`cloud-remote-send`**（1）、**`pr23-login-count`**（1）；其餘多數在 main 36 項內 |

### 39105013482 仍失敗（唯一項摘要，22）

- main 基準內：`board-cell-peak-simulation`、`cloud-qa-checklist`×2、`controller-post-send-board-read-abort`、`controller-source-quick-send`、`controller-store-picker`×2、`forbidden-store-then-qa-isolation`、`fresh-browser-pause-heartbeat`、`home-board-art-alignment`×2、`home-board-clear-then-push-stale-command`、`home-board-cloud-recovery`×2、`home-board-quick-send-one`、`home-board-stale-storage`、`home-board-ten-send-clear`×3
- 不在 main 36：`controller-actions`×3、`cloud-remote-send`、`pr23-login-count`

## 本輪 spec 變動（僅 zone-toggle 模式）

- **Harness：** `clickControllerDevButton` / `ByTestId`、`fill` / `select` → 展開 zone → `toBeVisible` → 操作
- **套用檔案（38 specs）：** 見 commit `9afba1d` `tests/e2e/*.spec.mjs`（含 `scripts/apply-controller-zone-clicks.mjs`）
- **CI：** `e2eShardCount` **20**，matrix 1–20

## 策略

- **不合併**、**不放寬** assertion／timeout／時長
- main 清單內失敗 **不改測試**；分支獨有紅字需再查（`controller-actions` / `cloud-remote-send` / `pr23`）
