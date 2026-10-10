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

## Run 38081812688（`a20cd28`）失敗調查

### 1) 失敗 job 日誌（`e2e-live-cloud`）

| 項目 | 內容 |
|------|------|
| Run | https://github.com/UltronService/milksha-demo/actions/runs/38081812688 |
| Job | `e2e-live-cloud`（id `114300115578`），19:57:14–20:16:08 UTC |
| 失敗測試 | `board-animation-live-cloud.spec.mjs` › `five sends within 3s and board animates` |
| 通過測試 | `controller-simulation-live-cloud.spec.mjs`（約 8.4m） |
| 表面錯誤 | `TimeoutError: page.waitForFunction: Timeout **180000ms** exceeded` @ spec 第 60 行（chip opacity 全部變不透明） |
| 重試 | retry #0/#1/#2 皆在同一 opacity 等待失敗；整段 live-cloud **17.9m** |

五次的「3 秒內出現在 ready 區」斷言（第 57–58 行）在三次重試中**都有跑到**（失敗點在後面的 opacity 等待，而非 3000ms 送號逾時）。

### 2) 是否與其他 CI 同時寫 `zz-qa-ci-store`

**有。** PR #41 的 `e2e-live-cloud` job 雖然掛了 `live-cloud-zz-qa-ci-store`，但**其他尚未合併本 PR 的分支**仍用舊 `ci.yml`：`npm run test:e2e`（含 live-cloud spec），**不會**進入該 concurrency group。

同期範例（與 38081812688 重疊）：

| Run | 分支 | 行為 |
|-----|------|------|
| [38081707389](https://github.com/UltronService/milksha-demo/actions/runs/38081707389) | `cursor/board-number-rules-a2ca`（PR #43） | 單一 `test` job、`npm run test:e2e` + `LIVE_CLOUD_STORE_ID=zz-qa-ci-store`；19:56:38 UTC 起跑 e2e |
| [38081812688](https://github.com/UltronService/milksha-demo/actions/runs/38081812688) | `cursor/ci-live-cloud-concurrency-d85e` | `e2e-live-cloud` job 19:58:12 UTC 起跑真雲端兩 spec |

PR #43 的 workflow 檔（SHA `7694bd1`）仍為整包 `test:e2e`，無 `live-cloud-zz-qa-ci-store` job。

[38078717603](https://github.com/UltronService/milksha-demo/actions/runs/38078717603)（PR #43 較早一次 run）在 19:52 已結束，**不是** 38081812688 窗口內的並行寫入來源。

### 3) 拆分 job 是否少 env / 少 server

- `LIVE_CLOUD_STORE_ID`、`MILKSHA_E2E_ARTIFACTS`、`FONTCONFIG_FILE` 與舊版相同。
- Live-cloud spec 用 `chromium.launch` + GitHub Pages 路由 shim，**不依賴**本地 `webServer` 內容；拆分前後一致。
- **測試程式 bug（可重現）**：Playwright `page.waitForFunction(fn, { timeout: N })` 兩參數形式會把 `{ timeout }` 當成 **page 參數**而非 options，實際逾時變成 context 預設 **180s**。opacity 若因並店干擾未收斂，每次重試各等 180s → 與 17.9m 失敗時間吻合。

### 4) 分支修正（根因與對策）

**根因 A — 測試 API 用法錯誤**  
`page.waitForFunction(fn, { timeout: N })` 在 Playwright 會把 `{ timeout }` 當 **page 參數**，實際逾時變 context 預設 180s（與 38081812688 的 180000ms 錯誤一致）。

**根因 B — 跨 PR 並寫 `zz-qa-ci-store`**  
未合併 PR #41 的分支仍跑整包 `test:e2e`（例：38081707389、38084621347），不進 `live-cloud-zz-qa-ci-store` group。

**根因 C — 斷言與真雲端 UI 行為不符（非產品 bug）**  
本機重現：五次 ready 送號後，5 個號碼皆可见，但 ready 區多枚 chip 刻意維持 `opacity: 0`，僅部分 chip 為 `1`（DOM 最後一顆不一定是新號）。原「全部 chip opacity=1」斷言必敗。

**修正**  
- `waitForFunction` 改第三參數傳 `timeout`。  
- live-cloud 連線後等 `data-board-online`、先 `clear_now`。  
- 動畫結束改 `waitForReadyBoardAnimSettled`（5 個 ready 號 + 至少一枚非 float chip 已不透明）。

合併 PR #41 後，其他分支 rebase 才會全部進 `live-cloud-zz-qa-ci-store` 排隊；合併前仍可能被舊 workflow 並寫。

## Concurrency 排隊驗證（兩個 PR 同時跑）

在 PR #41 的 `e2e-live-cloud` **in_progress** 時，另開暫時性 PR #42（同 workflow，`cursor/concurrency-probe-d85e`）：

| Run | Branch | `e2e-live-cloud` status |
|-----|--------|-------------------------|
| [38065251681](https://github.com/UltronService/milksha-demo/actions/runs/38065251681) | `cursor/ci-live-cloud-concurrency-d85e` | `in_progress` |
| [38065283913](https://github.com/UltronService/milksha-demo/actions/runs/38065283913) | `cursor/concurrency-probe-d85e` | `pending`（job `114251563955`） |

## 本 PR CI（tip 全綠）

- Branch tip SHA：`c8712b9`
- 全綠 run #1：https://github.com/UltronService/milksha-demo/actions/runs/38086805485（`7e49ad9`，`test` + `e2e-live-cloud`）
- 全綠 run #2（確認）：https://github.com/UltronService/milksha-demo/actions/runs/38088944616（`c8712b9` empty retrigger）
- 失敗調查 run：https://github.com/UltronService/milksha-demo/actions/runs/38081812688（`a20cd28`，見上文）

## grep：未動 zz-qa-store-a

此 PR 僅改 CI workflow、live-cloud 相關 e2e helper/spec 與本 REPORT。
