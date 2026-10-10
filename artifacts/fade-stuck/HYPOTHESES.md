# board-animation-live-cloud：五次 rapid send 後 chip opacity 卡住

**範圍**：`zz-qa-ci-store` only（不用 `zz-qa-store-a`）。**尚未改產品碼**；PR #41 維持分開，不在 #41 改 `board-animation-live-cloud.spec.mjs`。

**相關 CI**：PR #43 [38081707389](https://github.com/UltronService/milksha-demo/actions/runs/38081707389)（`7694bd1`）、[38087728649](https://github.com/UltronService/milksha-demo/actions/runs/38087728649)（`f5f62cb`，in-cell `opacity==='1'`，30s）；main [38065059485](https://github.com/UltronService/milksha-demo/actions/runs/38065059485)（`c7ba3ba`，**passed** — 全 chip、標稱 15s／實效 180s）；#41 [38081812688](https://github.com/UltronService/milksha-demo/actions/runs/38081812688)（無 #43 程式，同 main 斷言 family）。

---

## 0) 核心問題：**main 板端程式能否重現？**

在 **同一份 main workspace 板端 JS** 上，只換 **opacity 等待斷言**（不換產品碼）：

```bash
# 各跑 5 次；setup 對齊 main／f5f62cb spec（送號前不 clear，afterRun teardown）
LIVE_CLOUD_STORE_ID=zz-qa-ci-store node scripts/fade-stuck-assertion-matrix.mjs --mode fake --runs 5
LIVE_CLOUD_STORE_ID=zz-qa-ci-store node scripts/fade-stuck-assertion-matrix.mjs --mode live --runs 5
```

| 斷言 | 定義 | fake cloud（5 runs） | live `zz-qa-ci-store`（5 runs） |
|------|------|--------------------|--------------------------------|
| **main** | 全部 `.milksha-board-chip` → `opacity==='1'\|\|''`；**兩參數** `{ timeout:15000 }`（實效 **180s**） | **0 fail / 5 pass** | **5 fail / 0 pass**（每次 ~185s，`Timeout 180000ms`） |
| **pr43**（`f5f62cb`） | in-cell、非 float chip 同上；**三參數** `{ timeout:30000 }` | **0 fail / 5 pass** | **5 fail / 0 pass**（每次 ~35s，`Timeout 30000ms`） |

原始 JSON：`artifacts/fade-stuck/matrix-fake-main-vs-pr43.json`、`matrix-live-main-vs-pr43.json`（git `90b3822` 調查 branch，板端邏輯與 **main** 一致）。

**live 失敗當下快照（兩斷言相同）**：`readyNums===5`，**5** 枚 in-cell chip → **1×opacity `1`、4×opacity `0`**（無 float chip）。

**解讀**

- **Main 在真雲可重現**（5/5），且 **#43 嚴格 in-cell 斷言也 5/5 失敗** → 非「只有 #43 測太嚴」獨有；同一板端狀態下 **main 的寬鬆斷言也過不了**。
- **Fake cloud 兩斷言皆 0/5 fail** → 問題 **live 路徑／店況／雲端收包** 相關，非純斷言文案。
- **main CI `c7ba3ba` 38065059485 曾 pass** 與本次 **live 5/5 fail** 並存 → 視為 **環境／時序 flake 或當時店況較乾淨**，不能依單次綠 CI 否定重現；需在 **無並行寫店** 窗口再對照 matrix。

---

## 1) 最小可重現命令

### 首選：本機 fake cloud（隔離店況、可重複）

前置：`npm ci`、Chromium（與 e2e 相同）。

```bash
# 嚴格條件：5 次送號後，≥5 顆 in-cell 非 float chip 全部 opacity≥0.99
# 退出碼 1 = 在取樣窗口內未達 strict（常見於 T+0、T+500ms）
LIVE_CLOUD_STORE_ID=zz-qa-ci-store node scripts/fade-stuck-five-send-probe.mjs --mode fake
```

**本 branch 實測（clear_now + 等 chip=0 後再送）**：`artifacts/fade-stuck/fake-probe-after-clear.json` — T+500ms `strictPass: false`；**T+2000ms 起 `strictPass: true`**（exit 0）。  
→ fake cloud 上動畫**會收斂**，失敗主因是 **等待時間 / 斷言過嚴**，不一定是板端死鎖。

### 次選：真雲（僅 `zz-qa-ci-store`）

```bash
LIVE_CLOUD_STORE_ID=zz-qa-ci-store node scripts/fade-stuck-five-send-probe.mjs --mode live
```

**本 branch 實測**：`artifacts/fade-stuck/live-probe-after-clear.json` — 即使 `clear_now` 且腳本等 `chip.length===0`，送號後仍常見 **>5 顆 chip、部分長期 opacity 0**；45s 內 **strict 全 false**（exit 1）。  
未清板對照：`live-probe-sample.json`（開局即 12+ chip，並店/殘留更嚴重）。

### 對齊 main 上 e2e（會踩 Playwright 參數坑）

main 的 spec 在 opacity 步用 **兩參數** `waitForFunction(fn, { timeout: 15000 })` → 實際 **180s** 逾時（與 38081812688 日誌一致）：

```bash
LIVE_CLOUD_STORE_ID=zz-qa-ci-store npx playwright test tests/e2e/board-animation-live-cloud.spec.mjs
```

---

## 2) 假設（依可能性排序）

### H1 — 測試 harness：`waitForFunction` 逾時參數傳錯（**已證實**）

- **內容**：第二參數被當 page arg，options 為空 → 使用 context 預設 **180000ms**。
- **確認**：38081812688 日誌 `Timeout 180000ms` @ spec 第 60 行，而原始碼寫 `{ timeout: 15000 }`。
- **反證**：改為 `waitForFunction(fn, undefined, { timeout: N })` 後，失敗日誌應顯示 **N ms**（#41 修正 run 38084199701 已見 **15000ms**）。
- **與板端 bug 關係**：放大 CI 時間、模糊根因；**不是** opacity 永遠不變 1 的唯一原因。

### H2 — 真雲端店況未淨空 / 並行 CI 寫入（**已部分證實**）

- **內容**：`clear_now` 後板面仍殘留多號；或他 PR 整包 `test:e2e` 同寫 `zz-qa-ci-store`（無 `live-cloud-zz-qa-ci-store` group）。
- **確認**：38081812688 與 38081707389 時間重疊；probe 在 clear+等空後 T+0 仍見 **20 chips / readyNums 10**（`live-probe-after-clear.json`）。
- **反證**：單機 fake cloud、無並行 run、clear 後 chip=0 再送 → strict 在 **2s 內**通過（`fake-probe-after-clear.json`）。
- **與板端 bug 關係**：可導致 **live-only** 假「opacity 永不達 1」；需先排除殘留/並寫再判斷產品。

### H3 — Ready 區 rapid batch：部分 in-cell chip 長期 opacity 0（**live matrix 已確認狀態；是否 bug 未決**）

- **內容**：五次 150ms 間隔送 ready，舊 chip 維持 `opacity:0` 僅最新 fade-in（DOM 順序未必 = 送號順序）。
- **確認**：fake T+500ms 快照 `[2005→1, 2004–2001→0]`；strict「全 ≥0.99」為 **false**，T+2s 全 **1**。
- **反證**：fake 在 ~5s 內可讓 **5 枚 in-cell 全為 1**；若 live 在 **僅 5 枚 chip、無殘留** 時仍 30–180s 無法全 1 → 板端／雲端路徑 bug（matrix 已見 **恰好 5 枚** 仍 4×0）。
- **下一步（read-only）**：probe 改為只量 `.milksha-ready` 內 **恰好 5 枚** chip 的 opacity 序列（不改產品）。

### H4 — Headless `visibilitychange` / 背景分頁節流（**未證實，PR #43 方向**）

- **內容**：Chromium headless 下 opacity animation 被 throttle，需 synthetic visibility 才跑完。
- **確認**：probe 加 PR #43 同款 `visibilitychange` 後，live 在 **chip 已淨空** 前提下 45s 內 strict 轉 true。
- **反證**：fake cloud headless 無 visibility hack 仍於 2s 收斂 → 非唯一根因。
- **臨時 `[DBG-FADE]`（勿 commit）**：在 `js/board/milksha-board-anim.js` `runOpacityAnim` 開頭 `console.log('[DBG-FADE]', id, from, to, document.visibilityState)`，單次 live probe 看 animation 是否被呼叫後 stall。

### H5 — 真雲路徑動畫 promise / generation 競態（**待查，可能真 bug**）

- **內容**：`installLiveBranchCloudRoutes` + Firestore 增量與 `milksha-board-anim.js` 的 `gen`/`pendingRemove` 在 rapid push 下丟失 fade-to-1。
- **確認**：淨空店、無並行 CI、live probe 僅 5 ready chip，**15–45s 仍有 opacity 0**；`animProbe.opacityAnimRuns` 不再增加且 chip 卡 mid-opacity。
- **反證**：同 commit 假雲 2s 全 1 → 問題綁在 **cloud 收包 / 路由 / realtime** 而非 anim 核心邏輯。
- **臨時 `[DBG-FADE]`**：在 `applyPayload` 入口 log seq、ticket 數；anim 模組 log `promises.length` 與 `pendingRemove` 結束前 chip opacity。

---

## 3) Read-only / 暫時 log 已做與建議

| 動作 | 結果 |
|------|------|
| `scripts/fade-stuck-five-send-probe.mjs` 時間序列 JSON | 見 `artifacts/fade-stuck/*-probe*.json` |
| `scripts/fade-stuck-assertion-matrix.mjs` main vs pr43 計數 | `matrix-fake-main-vs-pr43.json`、`matrix-live-main-vs-pr43.json` |
| 產品檔 `[DBG-FADE]` | **未 commit**；需要時本地加 log 跑單次 probe |
| grep board 模組 `visibility` | **無** handler；PR #43 的 visibility 屬 **測試側** 喚醒 |

---

## 4) PR #41 狀態（與本 branch 分離）

- **PR**：https://github.com/UltronService/milksha-demo/pull/41（Ready for review）
- **最新綠 CI**： [38091506422](https://github.com/UltronService/milksha-demo/actions/runs/38091506422)（`66c6e38`）；後續 docs push 可能再觸發 run
- **#41 對本議題**：workflow concurrency + e2e harness 修正；**刻意不在 #41 定案板端 fade bug**
- **與 #43**：同檔 `board-animation-live-cloud.spec.mjs` 會 merge conflict；#43 的 visibility/0.99×5 與本文件 H3/H4 假設相關，**合併前需統一驗收定義**

---

## 5) 建議下一步（仍不改產品）

1. 在 **無並行 live-cloud CI** 窗口重跑 `live-probe-after-clear`（或合 #41 後僅 concurrency job 寫店）。
2. 收窄 strict：僅 `.milksha-ready` 且 `chipCount===5` 時量 opacity。
3. 若仍失敗 → 啟用 `[DBG-FADE]` 本地單次比對 fake vs live 同 five-send 腳本。
