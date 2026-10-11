# board-animation-live-cloud / ready 區 fade 卡住

**店**：僅 `zz-qa-ci-store`（不用 `zz-qa-store-a`）。**未改產品碼**（`[DBG-FADE]` 僅本地/WAAPI hook，未 commit）。

**Branch**：`cursor/fade-stuck-debug`（base 已 merge `main` @ `f9d0513`，#43 已合）。

---

## QA 新事實（08:14 核准調查）

公開站 **main**、桌面 Chrome、板面常駐前景：`btn-clear-now` → `btn-send-numbers` **5 次、約 1s 間隔** → ready 區 5 枚 chip，**僅最新 opacity 1**，其餘 4 枚長時間 **opacity 0**（例：2005=1，2004–2001=0，39s+ 仍不恢復）。  
→ **假設 4（headless 節流）不成立**。

---

## 重現命令

前置：`npm ci`、Playwright Chromium。

```bash
# 主矩陣（1s / 5s 間隔，各 3 輪，末次送號後每 0.5s 採樣至 45s）
LIVE_CLOUD_STORE_ID=zz-qa-ci-store node scripts/fade-stuck-interval-matrix.mjs --mode live --gaps 1000,5000 --rounds 3

# 對照 fake cloud（含 200ms 快送）
node scripts/fade-stuck-interval-matrix.mjs --mode fake --gaps 200,1000,5000 --rounds 3

# 舊矩陣（main vs #43 斷言，各 5 次）
LIVE_CLOUD_STORE_ID=zz-qa-ci-store node scripts/fade-stuck-assertion-matrix.mjs --mode live --runs 5
```

### 數字摘要（2026-10-11 調查）

| 環境 | 送號間隔 | 3 輪後 45s 仍非全不透明 | 典型 45s 板面 |
|------|----------|-------------------------|---------------|
| **live** 真雲 | **1s** | **3/3** | 5 in-cell，**1 不透明 + 4× opacity 0**（最舊四枚） |
| **live** 真雲 | **5s** | **3/3** | 同上（**5s 無法治癒**） |
| **fake** | 200ms / 1s / 5s | **0/3** 各 | 5/5 opacity 1 |

- 舊矩陣 live：**main 5/5 fail、pr43 5/5 fail**；fake：**0/0 fail**。
- 詳細 JSON：`artifacts/fade-stuck/interval-matrix-summary.json`、完整序列 `interval-matrix-live-*.json` / `interval-matrix-fake-*.json`。

---

## 優先假設（PR #36 ready pulse + 中斷）— **已確認（機制 + 真雲放大）**

**白話**：每來一個新 ready 號，新 chip 會跑 **fade-in + 1.3× pulse**（`animateReadyPulse`）；舊 chip 因格子重排常被當成「錯位 chip」**fade-out 再重建**，重建時 again **inline opacity 0 + 新 pulse**。pulse 被 **cancel / generation 作廢** 時 **`oncancel` / 作廢的 `onfinish` 不會 `snapOpacity(1)`**，inline 停在 **`0`**；真雲上 **單次按送號會觸發多次 `applyPayload`**，generation 連續跳號，pulse **永遠收斂不到 1**。

**驗證結果**：

- (a) live **1s 與 5s** 皆 **3/3** 卡 4×0（見上表）。
- (b) fake **同板端 JS**、**200ms～5s** 皆 **0/3** 失敗 → 非斷言問題；fake 與 live 差在 **雲端推送次數/時序**（見下）。
- (c) WAAPI hook：`waapi-cancel` 時常 **`inlineOpacity: '0'`**；45s 後舊 chip 仍 **`animCount: 1`**、**`inlineOpacity: '0'`**（live），fake 同場景 **`animCount: 0`、全 1**。

**根因（精確位置，plain words）**

1. **`js/board/milksha-board-anim.js` → `animateReadyPulse`（約 313–352 行）**  
   - 開始：`el.style.opacity = '0'`（326）。  
   - **`anim.oncancel`（349–351）只 `resolve()`，不 `snapOpacity(1)` 也不 `commitStyles`。**  
   - **`onfinish` 若 `getGeneration() !== generation`（341–344）同樣不 snap**，inline 可永久停在 0。

2. **同檔 `animateOpacity`（267–291）** — `oncancel` 同樣不還原 opacity。

3. **同檔 `syncZone`（693–751）** — slot reconcile 對「錯 slot 的 chip」呼叫 **`scheduleChipFadeOutRemove`**（698–702），即使該 id 仍在 **`diff.moved`**；接著 **`pendingRemove` 導致同 id 新建 chip**（733–748）：**`snapOpacity(chip, 0)` + `runReadyPulseAnim`**，每來一號舊 chip **重跑 pulse**。

4. **`js/milksha-board.js` → `commitBoardView`（596–622）** — 每次 apply：**`cancelAll`（generation++）→ prep `syncZone`（++）→ ready `syncZone`（++）**；pulse 綁定的 generation 易在 finish 前作廢。

5. **真雲放大（非 headless）**：`scripts/fade-stuck-payload-count-probe.mjs` 單輪 5 送 — **fake** 每送約 **1–2 次** `applyPayload`；**live 第 2 送約 **5 次****（800ms 內）。難怪 **5s 間隔仍 fail**：間隔再長，**額外 RTDB/echo apply** 仍會在中途 cancel pulse。

---

## 假設列表（排序）

1. **（確認）Ready pulse 被 cancel / generation 作廢後未 commit 最終 opacity，inline 停 0。**  
   **驗證**：live 45s 快照 + `animateReadyPulse` `oncancel` 程式碼；fake 同 JS 較少 apply 故通過。

2. **（確認）`syncZone` reconcile 對應移動中的 chip 誤走 fade-out + 重建，每送重觸 pulse。**  
   **驗證**：讀 693–751 行；後續可補 unit：連續 add 兩 item 不應 `scheduleChipFadeOutRemove` 可見 id。

3. **（確認）真雲單次操作多次 `applyPayload`（例：live 第 2 送 ×5）。**  
   **驗證**：`node scripts/fade-stuck-payload-count-probe.mjs --mode live` vs `--mode fake`。

4. ~~Headless 節流需 visibility hack~~ — **QA 否決**。

5. **並行 CI 寫同一店** — 仍可能惡化，但 **無法解釋公開站手動 repro**；保留為 CI 噪音因子。

---

## 建議最小修復（尚未實作）

1. **`animateReadyPulse` / `animateOpacity`**：在 **`oncancel`** 與 **generation 作廢的 `onfinish`** 路徑，對 **opacity keyframe** 呼叫 **`snapOpacity(el, to)`** 或 **`anim.commitStyles()` + 清除 fill**。  
2. **`syncZone` reconcile**：若 chip id ∈ **`diff.moved`** 且仍在新列表，**不要** `scheduleChipFadeOutRemove`，改為後續 **appendChild / FLIP** 即可。  
3. **（可選第二 PR）** 調查 live **為何一送多 apply**（RTDB listener / snapshot echo），避免 generation 風暴。

**Regression test 想法（main 上應 fail）**  
`tests/e2e/board-animation-live-cloud.spec.mjs`（或新 spec）：`zz-qa-ci-store`、clear → **5× send、1s 間隔** → 等 **10s** → assert ready in-cell **5 枚 `getComputedStyle.opacity >= 0.99`**。  
今日 live **0/3 通過**；fake 會 green，故 **必須 live-cloud job**（或 mock 連續 5× `applyPayload` 的 unit/integration）。

**Fix ETA（工程，非日曆）**  
- 動畫 **oncancel / snap** + **moved reconcile** 修正：**小 diff（~2 檔、 tens of lines）**，本地 fake + live 矩陣重跑 + 新 e2e：**約半個工作 session**。  
- 真雲 **多重 apply** 根因：**需另開 trace**（listener / functions），不與動畫 snap 綁死。

---

## 工具腳本

| 腳本 | 用途 |
|------|------|
| `scripts/fade-stuck-interval-matrix.mjs` | 1s/5s/200ms 間隔 + 0.5s 採樣 |
| `scripts/fade-stuck-assertion-matrix.mjs` | main vs pr43 斷言矩陣 |
| `scripts/fade-stuck-payload-count-probe.mjs` | 每送 `applyPayload` 次數 |
| `scripts/fade-stuck-five-send-probe.mjs` | 簡化時間軸 |

---

## PR #41 / #43

- #41：CI concurrency / harness — **不代替板端 fade 修復**。  
- #43 已 merge `f9d0513`；公開站 repro 表示 **pulse/interrupt 問題仍在 main**。

---

## 狀態

- **已完成**：merge `f9d0513`；interval 矩陣 live/fake；applyPayload 計數；根因行號；QA 對齊。  
- **未完成**：產品 patch；live 多重 apply 來源 trace；`[DBG-FADE]` 進 `milksha-board-anim.js`（可選，未 commit）。
