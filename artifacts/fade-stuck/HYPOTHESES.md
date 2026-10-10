# board-animation-live-cloud：五次送號後 chip 不透明

**店**：僅 `zz-qa-ci-store`（不用 `zz-qa-store-a`）。**未改產品碼**。

**Branch**：`cursor/fade-stuck-debug`（與 PR #41 分開）。

---

## 重現命令（main 板端 JS，只換斷言）

前置：`npm ci`、Playwright Chromium。

```bash
LIVE_CLOUD_STORE_ID=zz-qa-ci-store node scripts/fade-stuck-assertion-matrix.mjs --mode live --runs 5
```

（對照用 fake cloud：`--mode fake --runs 5`，通常兩種斷言都會過。）

### main vs #43 失敗次數（各 5 次，live 真雲）

| 斷言 | 說明 | fail / 5 |
|------|------|----------|
| **main** | 所有 chip 都要 opacity 為 1；spec 寫 15s 但 Playwright 兩參數實際等 **180s** | **5** |
| **pr43**（`f5f62cb`） | 格子內非 float chip 都要 opacity 為 1，等 **30s** | **5** |

- fake cloud：main **0** fail、pr43 **0** fail（各 5/5 pass）。
- live 失敗時板面：5 個 ready 號、5 枚 in-cell chip，常見 **1 枚不透明、4 枚仍 opacity 0**。
- 原始紀錄：`artifacts/fade-stuck/matrix-live-main-vs-pr43.json`、`matrix-fake-main-vs-pr43.json`。

**main 能否重現？** 真雲上 **能**（5/5）；與 main CI [38065059485](https://github.com/UltronService/milksha-demo/actions/runs/38065059485)（`c7ba3ba`）曾過並不矛盾，可能是當時店況較乾淨或在 180s 內僥倖收斂。PR #43 runs [38081707389](https://github.com/UltronService/milksha-demo/actions/runs/38081707389)、[38087728649](https://github.com/UltronService/milksha-demo/actions/runs/38087728649) 與 #41 [38081812688](https://github.com/UltronService/milksha-demo/actions/runs/38081812688) 同類失敗。

---

## 假設（依可能性排序）

1. **真雲連線下，rapid 送 5 個 ready 號後，有多枚 chip 的 fade 動畫在 live 路徑沒跑完（長期停在 opacity 0）。** 驗證：在无其他 CI 寫同一店時重跑上方 matrix；若仍 5/5 fail 且快照仍是 4×0，則偏向板端／雲端收包問題，而非測試寫法 alone。

2. **並行 CI 或其它 PR 的整包 e2e 同時寫 `zz-qa-ci-store`，清板或送號互相干擾，造成假「fade 卡住」。** 驗證：對照 GitHub Actions 時間軸（例 #43 38081707389 與 #41 38081812688 重疊）；合 PR #41 concurrency 後在无並行 live-cloud job 窗口再跑 matrix，看 fail 是否下降。

3. **main spec 把 `{ timeout: 15000 }` 傳成第二參數，實際等到 180s，拖長 CI 並像「卡 3 分鐘」。** 驗證：看失敗 log 是否為 `Timeout 180000ms` 且原始碼第 60 行為兩參數形式；改三參數後 log 應顯示 15000ms（harness 問題，不單獨解釋 4×opacity 0）。

4. **Headless 瀏覽器對 opacity 動畫節流，需人工 visibility 事件才收斂（PR #43 曾加 workaround）。** 驗證：在 matrix 一輪中送號後注入 PR #43 同款 `visibilitychange`，若 live 由 fail 變 pass 則支持此假設；fake cloud 無 hack 仍 5/5 pass 表示非唯一原因。

5. **假 cloud 與真雲收包／路由不同，anim 邏輯在本地正常、上線異常。** 驗證：同 commit 下 fake 5/5 pass、live 5/5 fail 已成立；下一步用未 commit 的 `[DBG-FADE]` log 比對 `applyPayload` 與 `runOpacityAnim` 在 live 是否被呼叫後中斷。

---

## 其它工具（未改產品）

```bash
LIVE_CLOUD_STORE_ID=zz-qa-ci-store node scripts/fade-stuck-five-send-probe.mjs --mode live
LIVE_CLOUD_STORE_ID=zz-qa-ci-store npx playwright test tests/e2e/board-animation-live-cloud.spec.mjs
```

---

## PR #41（分離）

https://github.com/UltronService/milksha-demo/pull/41 — CI concurrency／e2e harness；不在 #41 定案 fade 板端 bug。

---

## 狀態（調查完成度）

- **已完成**：live／fake 各 5 次 main vs pr43 matrix、probe 時間序列、HYPOTHESES 本檔。
- **未完成**：无並行 CI 窗口下的矩陣重跑、`[DBG-FADE]` 本地 log、visibility hack 對照實驗（需另跑，不 commit log）。
