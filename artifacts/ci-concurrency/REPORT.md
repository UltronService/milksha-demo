# CI 真雲端 concurrency 報告

## 問題

`ci.yml` 同時在 `pull_request` 與 `push`（main）觸發，且真雲端 spec 無全域互斥時，兩個 workflow 可能同時寫入 `zz-qa-ci-store`，其中一邊的 `clear_now` 會清掉另一邊的號碼。

## Workflow diff（摘要）

- **Workflow concurrency**：`ci-${{ github.event.pull_request.number || github.ref }}` + `cancel-in-progress: true`（同一 PR/ref 只保留最新一次 run）。
- **`test` job**：`npm test` + 本地 e2e（`find` 排除 `*-live-cloud.spec.mjs`）。
- **`e2e-live-cloud` job**：只跑兩支 live-cloud spec；`concurrency.group: live-cloud-zz-qa-ci-store`、`cancel-in-progress: false`（全 repo 一次只跑一組）。

完整 diff 見 PR #41 的 `.github/workflows/ci.yml`。

## 避免 PR 同一 commit 跑兩次

- `push` 僅限 `branches: [main]`；PR 分支更新只會觸發 `pull_request`（不會再觸發 `push`）。
- 同一 PR 連續 push 時，workflow concurrency 會取消舊 run，避免並行兩套完整 CI。

## 本 PR CI（含 live-cloud job）

- Branch tip：`6e948f6`
- 最新全綠 run（PR #41）：https://github.com/UltronService/milksha-demo/actions/runs/38072350546 — **success**（`test` + `e2e-live-cloud` 皆綠）
- 首次 workflow 驗證 run：https://github.com/UltronService/milksha-demo/actions/runs/38065251681 — **success**
- Workflow 變更 commit：`c46f948`

## Concurrency 排隊驗證（兩個 PR 同時跑）

在 PR #41 的 `e2e-live-cloud` **in_progress** 時，另開暫時性 PR #42（同 workflow，`cursor/concurrency-probe-d85e`）：

| Run | Branch | `e2e-live-cloud` status |
|-----|--------|-------------------------|
| [38065251681](https://github.com/UltronService/milksha-demo/actions/runs/38065251681) | `cursor/ci-live-cloud-concurrency-d85e` | `in_progress`（job id 先啟動） |
| [38065283913](https://github.com/UltronService/milksha-demo/actions/runs/38065283913) | `cursor/concurrency-probe-d85e` | `pending`（job id `114251563955`，`runner_name: null`，等待 concurrency group） |

```bash
# 2026-10-10T15:51:14Z 擷取
gh run view 38065251681 --json jobs --jq '.jobs[] | select(.name=="e2e-live-cloud") | {status, startedAt}'
gh run view 38065283913 --json jobs --jq '.jobs[] | select(.name=="e2e-live-cloud") | {status, startedAt}'
```

第二個 run 的 live-cloud job 維持 **pending** 直到第一個完成，符合「排隊、不搶跑、不 cancel 進行中」設定。

## grep：未動 zz-qa-store-a

此 PR 僅改 `.github/workflows/ci.yml` 與本 REPORT；未改產品碼與 `zz-qa-store-a` 相關測試。
