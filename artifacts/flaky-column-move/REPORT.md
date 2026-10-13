# column-move test 5 修復報告

## 根因（採用假設 1、2）

1. **poll 與 trigger 並行**：舊 `pollMotionSamples` 在 Node 端同 tick 開 poll，常錯過 enter-from-above 窗口（CI 28 帧全為 `transform:none`、top 不變）。
2. **跨 process 取樣延遲**：`applyPayload` 在瀏覽器 layout／WAAPI 開始後，Playwright 往返取樣易落在動畫結束後。

## 修復（僅測試）

- 新增 `pollMotionSamplesInPage`：同一 `page.evaluate` 內 `applyPayload` →（可選 double rAF）→ 連續取樣。
- ready 左欄溢出 enter（test 5）：`postPayloadRaf: 'none'`，送號後立即取樣。
- 保留 `assertEnterFromAboveMotion` 門檻不變（translateY &lt; -8 或 top Δ &gt; 12）。
- 單元測試 `tests/board-column-move-poll.test.js`：證明舊 parallel 時序在「已落定」樣本下必敗。

## 本機 30 次結果（main + 此分支，`FONTCONFIG_FILE=tests/e2e/fonts/fontconfig-e2e.conf`）

| 情境 | 命令 | 結果 |
|------|------|------|
| 一般 | `for i in $(seq 1 30); do npx playwright test tests/e2e/board-column-move.spec.mjs -g "5 ready:" --reporter=line; done` | **30 / 30 通過** |
| stress-ng | 背景 `stress-ng --cpu 2`，同上 30 次 | **30 / 30 通過** |
| 對照 prep | `-g "2 prep:"` 30 次 | **30 / 30 通過** |
| 全檔 | `npx playwright test tests/e2e/board-column-move.spec.mjs` | **20 / 20 通過** |

## 手動驗收（UAT）

1. CI `test` job 綠（含 unit + e2e 非 live-cloud）。
2. 本地重跑：`npx playwright test tests/e2e/board-column-move.spec.mjs -g "5 ready:"` 連續數次皆過。
