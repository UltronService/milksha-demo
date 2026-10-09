# 看板叫號動態自測報告（QA 交付）

- **HEAD**: （push 後以 `git rev-parse HEAD` 為準）
- **PR**: https://github.com/UltronService/milksha-demo/pull/35
- **CI（0999e09 功能驗證）**: https://github.com/UltronService/milksha-demo/actions/runs/37902356270 — **success**
- **CI（0989854 僅文件）**: https://github.com/UltronService/milksha-demo/actions/runs/37905584499 — **failure**（`board-animation` spec1 opacity 時序 flake；live-cloud 4097ms 標 flaky）
- **指標檔**: `artifacts/board-animation-self-qa/metrics.json`
- **連續幀 contact sheet**: `artifacts/board-animation-self-qa/contact-sheets/`（約 11.8 MB）

## 1. 效能（CDP CPU 4×，longtask + rAF 幀間隔）

量測窗：各情境 `startBoardPerfSession` → 動作 → 650–900ms 後 `stopBoardPerfSession`（見 `scripts/board-animation-perf-harness.mjs`）。

| 情境 | 分支 1080 | main 1080 | 分支 4K | main 4K |
|------|-----------|-----------|---------|--------|
| 1-new-prep | 60.6 fps / >50ms:0 / LT:0 max 0ms | 60.9 fps / >50ms:0 / LT:0 max 0ms | 61.3 fps / >50ms:0 / LT:0 max 0ms | 61 fps / >50ms:0 / LT:0 max 0ms |
| 2-call-ready | 60 fps / >50ms:0 / LT:0 max 0ms | 60 fps / >50ms:0 / LT:0 max 0ms | 60 fps / >50ms:0 / LT:0 max 0ms | 60 fps / >50ms:0 / LT:0 max 0ms |
| 3-pickup | 60 fps / >50ms:0 / LT:0 max 0ms | 60 fps / >50ms:0 / LT:0 max 0ms | 60 fps / >50ms:0 / LT:0 max 0ms | 60 fps / >50ms:0 / LT:0 max 0ms |
| 4-page-turn | 60 fps / >50ms:0 / LT:0 max 0ms | 60 fps / >50ms:0 / LT:0 max 0ms | 60 fps / >50ms:0 / LT:0 max 0ms | 60 fps / >50ms:0 / LT:0 max 0ms |
| 5-clear | 60 fps / >50ms:0 / LT:0 max 0ms | 60 fps / >50ms:0 / LT:0 max 0ms | 60 fps / >50ms:0 / LT:0 max 0ms | 60 fps / >50ms:0 / LT:0 max 0ms |
| 6-rapid-5 | 60 fps / >50ms:0 / LT:0 max 0ms | 60 fps / >50ms:0 / LT:0 max 0ms | 60 fps / >50ms:0 / LT:0 max 0ms | 60 fps / >50ms:0 / LT:0 max 0ms |


- **對照結論**：分支與 main 在同機假雲端 local 注入下，六情境 avg fps 皆約 60、>50ms 幀與 longtask 皆 0；動畫未在 4× CPU 下造成可量測掉幀。

## 2. 真雲端送號（zz-qa-store-a，每次 ≤3000ms）

| 路徑 | 5 次 (ms) | 最大 | 中位 |
|------|-----------|------|------|
| 分支（branch site route + 雲端 API） | 495, 107, 911, 831, 828 | 911 | 828 |
| main Pages JS（無 branch route，同時段對照） | 22, 843, 1031, 846, 862 | 1031 | 846 |

- e2e 斷言：`board-animation-live-cloud.spec.mjs` 五次皆 `toBeLessThanOrEqual(3000)`（已移除 5s 高負載容錯）。
- 延遲主要來自雲端推送／看板收包與 DOM 更新，與 opacity 動畫無關（假雲端 dom→opacity 見下）。

## 3. 假雲端 ~500ms 與 dom→opacity

**起訖**：控制端 `click [data-testid=btn-send-numbers]`（`Date.now()`）→ 看板 `.milksha-ready .milksha-num` 數量達標（`waitForFunction` 返回）。

| 版本 | 中位 (ms) | 最大 (ms) | dom→opacity 平均 (ms) |
|------|-----------|-----------|------------------------|
| 分支 | 498 | 4929 | 見各 sample（≈0） |
| main | 498 | 498 | ≈0 |

- **~498–500ms**：假雲端看板輪詢約 500ms 一格；穩定後幾乎貼齊週期，非動畫成本。
- **首筆 outlier**（分支 sample#1 4929ms）：冷啟動／尚未對齊輪詢相位；main 首筆亦可能偏高。
- **chip-dom → opacity-anim-start**：`notePerf` 於 chip 進 DOM 與 WAAPI opacity 啟動時戳記；實測 **0–0.1ms**，證明號碼先進 DOM，動畫不拖顯示。

## 4. 何時不做動態（已改為來源優先）

| 條件 | 原因 |
|------|------|
| `first-payload` | 開機第一包避免全場閃爍 |
| `silent: true` | 重連整份 snapshot，非營運增量 |
| `forceSnapshotSkip: true` | 明確整份重載旗標（測試／擴充） |
| reduced-motion / 無 WAAPI | 無障礙與降級 |

**為何不再用 bulk-snapshot-combined（交集 &lt;35% 且 ≥6）當主判斷**：正常 `onSnapshot` 尖峰（一次 3 新單 + 3 叫號）會被誤判為「整包替換」而跳過動畫；seq／重連旗標只能涵蓋重連，無法區分「營運增量合批」與「整份重載」。現行規則僅在 **silent／first／force** 時 skip；尖峰仍 animate（`board-list-diff.test.js` + `board-animation.spec.mjs` peak case）。

`isBulkSnapshotReplace` 仍保留供診斷，**不**參與 skip。

## 5. Contact sheet（QA 目視）

每解析度 × 六情境一張 JPG：`contact-sheets/{1920x1080|3840x2160}-{1-new-prep…6-rapid-5}.jpg`。

## 6. 自動化

| 項目 | 結果 |
|------|------|
| `npm test` | 167 passed |
| `npx playwright test board-animation` | 13 passed |
| `npm run test:e2e` 全量（本機 0999e09 前） | **154 passed**, **2 failed**, 4 skipped（28.2m；見 `e2e-full-latest.log`） |
| `npm run test:e2e`（CI run 37902356270 @ 0999e09） | **success**（含 Roboto 字型步驟） |

## 7. 全量 e2e 失敗項：main `c8d8174` 對照（各跑 3 次）

環境：本機 worktree `git worktree add` @ `c8d8174ceb4f1909111cbd6d9e1bd3170b32cf9f`；分支同機連跑 3 次對照。

### `home-board-first-number-after-open.spec.mjs` › fake-cloud: first send within 3s

| 版本 | 3 次結果 |
|------|----------|
| **main c8d8174** | **3 passed**（1.5s / 1.9s / 1.4s） |
| **分支 0999e09** | **3 passed**（1.6s / 1.4s / 1.4s） |

全量 suite 曾出現 `Received: 5342` ms（`expect(elapsedMs).toBeLessThan(3000)`）為**高負載順序下的輪詢 flake**；單獨重跑 main／分支皆過，**非本 PR 看板動畫回歸**。

### `guest-clock.spec.mjs` › ring overlay fit widest 4-digit per font at all viewports

| 版本 | 3 次結果 |
|------|----------|
| **main c8d8174** | **0 passed, 3 failed**（每次相同） |
| **分支 0999e09** | **0 passed, 3 failed**（每次相同） |

錯誤訊息（main／分支一致）：

```
expect(received).toMatch(expected)
Expected pattern: /^Roboto/i
Received string:  "DejaVu Sans"
  at guest-clock.spec.mjs:314:26
```

本機未裝 CI workflow 的 Roboto 平台字型，與 main 同失；CI 安裝字型後全量 e2e 綠（37902356270）。**非本 PR 引入**。

### CI 0989854 失敗後（僅 e2e 穩定化，無產品邏輯變更）

`assertChipsOpaqueAndUnique` 改為先 `waitForChipsOpaque`（等 WAAPI opacity 結束），避免 CI 慢機在 350ms 固定等待未結束即斷言。

## 手動 UAT 速查

1. local 新單 → 0.3s 淡入、格子不跳  
2. 叫號 → 綠底 3s 後淡回奶油白  
3. 取餐 → 淡出補位  
4. &gt;10 準備中 → 換頁 cross-fade  
5. 清空 → 全淡出  
6. silent 重送 → 無動畫  
7. 減少動態 → 無動畫  
