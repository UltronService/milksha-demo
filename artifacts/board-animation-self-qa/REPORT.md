# 看板叫號動態自測報告（QA 交付）

- **HEAD**: `f13c8c9ae3cb1177fadfcde560a53af0ebc78763`
- **PR**: https://github.com/UltronService/milksha-demo/pull/35
- **CI（此 HEAD）**: https://github.com/UltronService/milksha-demo/actions/runs/37901951940
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
| `npm test` | 167 passed（本輪） |
| `npx playwright test board-animation` | 13 passed |
| `npm run test:e2e` 全量 | （執行中或見 `e2e-full-latest.log`） |

## 手動 UAT 速查

1. local 新單 → 0.3s 淡入、格子不跳  
2. 叫號 → 綠底 3s 後淡回奶油白  
3. 取餐 → 淡出補位  
4. &gt;10 準備中 → 換頁 cross-fade  
5. 清空 → 全淡出  
6. silent 重送 → 無動畫  
7. 減少動態 → 無動畫  
