# 等待配對中 — TDD 紅燈報告

| Field | Value |
| --- | --- |
| Branch | `cursor/waiting-pairing-red` |
| Head commit | `6d085f8` |
| Base | `main` |
| PR | **不開**（本輪僅紅燈測試） |
| 相依 | rebase / merge **PR #108**（`cursor/store-setup-screen-0c9f`）後再跑綠燈 |

## 測試執行摘要

| Suite | 結果 | 說明 |
| --- | --- | --- |
| `npm test`（含新檔） | **337 pass / 18 fail** | 18 失敗皆為本功能未實作；舊檔 **327 pass** 與 main 一致 |
| `npx playwright test tests/e2e/home-board-waiting-pair*.spec.mjs` | **全失敗** | 逾時等不到 `[data-testid="board-waiting-pair"]` 或 #108 setup gate |

## 規格項 → 測試對照

| # | 測試檔 | 測試名稱 | 紅燈原因（一句） |
| --- | --- | --- | --- |
| 1 | `tests/e2e/home-board-waiting-pair.spec.mjs` | item 1: waiting overlay shows centered… | DOM 無 `board-waiting-pair` overlay |
| 2 | `tests/board-waiting-pair.test.js` | item 2: display store id trims ends only… | `js/board/board-waiting-pair.js` 不存在 |
| 2 | `tests/e2e/home-board-waiting-pair.spec.mjs` | item 2: URL store casing preserved… | 同上，無等待 UI |
| 3 | `tests/e2e/home-board-waiting-pair.spec.mjs` | item 3: waiting text font size… | 無 overlay，無法量比字型 |
| 4 | `tests/e2e/home-board-waiting-pair.spec.mjs` | item 4: waiting overlay has no blink… | 無 overlay |
| 5 | `tests/board-waiting-pair-host.test.js` | item 5: waiting overlay state hides bind hint… | `board-waiting-pair-host.js` 不存在 |
| 5 | `tests/e2e/home-board-waiting-pair.spec.mjs` | item 5: while waiting hide ready/preparing… | 未進入 waiting 模式，區塊仍顯示 |
| 6 | `tests/e2e/home-board-waiting-pair.spec.mjs` | item 6: waiting overlay does not cover board title | 無 overlay |
| 7 | `tests/board-waiting-pair-host.test.js` | item 7: renderWaitingOverlay assigns textContent… | host 模組未實作 |
| 7 | `tests/e2e/home-board-waiting-pair.spec.mjs` | item 7: HTML in store param renders as plain text | 無 waiting 文案 |
| 8 | `tests/e2e/home-board-waiting-pair.spec.mjs` | item 8: s999998 waiting line fits one row… | 無 overlay |
| 9 | `tests/e2e/home-board-waiting-pair.spec.mjs` | item 9 static / item 9 motion=on | 無 overlay（靜態與 motion 皆然） |
| 10 | `tests/board-waiting-pair.test.js` | item 10: PAIR_RETRY_INTERVAL_MS… | 純函式模組未實作 |
| 10 | `tests/fake-cloud-board-waiting-pair.test.js` | item 10/14 baseline: unregistered s999998 returns waiting_pair | fake-cloud 仍回 `ok:false` 無 `code:waiting_pair` |
| 10 | `tests/e2e/home-board-waiting-pair.spec.mjs` | item 10: retries boardAutoPair no faster than 10s | 未進 waiting 重試流程 |
| 11 | `tests/e2e/home-board-waiting-pair.spec.mjs` | item 11: register store within 15s completes pairing | 無 waiting→成功轉場 |
| 12 | `tests/e2e/home-board-waiting-pair.spec.mjs` | item 12: after success zones visible… | 無法從 waiting 配對成功 |
| 13 | `tests/board-waiting-pair.test.js` | item 13: stopRetry clears scheduled retry timer id | 重試 scheduler 未實作 |
| 13 | `tests/e2e/home-board-waiting-pair.spec.mjs` | item 13: after success retry timer stops | 無 waiting 重試計數行為 |
| 14 | `tests/e2e/home-board-waiting-pair.spec.mjs` | item 14: POS reject keeps waiting overlay visible | 無 overlay；`/test/posRejectStore` 未實作 |
| 15 | `tests/e2e/home-board-waiting-pair.spec.mjs` | item 15: two devices same store both pair successfully | 雙機未進 waiting 成功路徑 |
| 16 | `tests/board-waiting-pair-store-gate.test.js` | item 16: missing or invalid URL uses 請設定店編號 | **#108 未合併**：`js/store-id.js` / `home-board-store.js` 不存在 |
| 16 | `tests/e2e/home-board-waiting-pair.spec.mjs` | item 16: invalid URL store shows setup gate | **#108 未合併**：無 `data-testid="board-store-setup"` |
| 17 | `tests/board-waiting-pair.test.js` | item 17: classifyBoardAutoPairResponse maps… | 分類函式未實作 |
| 17 | `tests/board-waiting-pair-bind-api.test.js` | item 17: requestBoardAutoPair waiting_pair / invalid_store_format | `board-bind-api` 未拋 `pairWaiting` / `pairInvalidStoreFormat` |
| 17 | `tests/e2e/home-board-waiting-pair.spec.mjs` | item 17: cloud invalid_store_format shows setup gate | 無 setup gate + 無雲端格式分支 |
| 18 | `tests/e2e/home-board-waiting-pair.spec.mjs` | item 18: disabled store shows existing pair failure… | 行為與 waiting 規格未分流 |
| 19 | `tests/e2e/home-board-waiting-pair.spec.mjs` | item 19: offline shows 離線 not waiting… | 斷網時仍可能走 boot-error 而非離線+恢復 waiting |
| 20 | `tests/board-waiting-pair-store-gate.test.js` | item 20: URL store s999998 clears stale bind record a17… | `board-url-bind-sync.js` 不存在 |
| 20 | `tests/board-waiting-pair-store-gate.test.js` | item 20: blank URL store clears bind record… | 同上 |
| 20 | `tests/e2e/home-board-waiting-pair.spec.mjs` | item 20 e2e: stale a17 bind record cleared… | 未清紀錄、未送 s999998 配對 |
| 21 | `tests/e2e/home-board-waiting-pair.spec.mjs` | item 21: reload keeps waiting state | 重整後無 waiting 狀態 |
| 22 | `tests/board-waiting-pair.test.js` | item 22: simulateHourOfRetries does not accumulate timers | 模擬函式未實作 |
| 22 | `tests/e2e/home-board-waiting-pair-perf.spec.mjs` | item 22: ~1h waiting retries without timer leak | 無 `__milkshaWaitingPairActiveTimers` / overlay |
| 23 | `tests/e2e/home-board-waiting-pair-perf.spec.mjs` | item 23: after pair shows buffered numbers up to 500… | `/test/seedBoardNumbers` 與配對後佇列未實作 |
| 24 | `tests/e2e/home-board-waiting-pair-perf.spec.mjs` | item 24 motion=on: first paired numbers skip enter animation… | 無 `__milkshaBoardSkippedInitialEnterAnim` 行為 |

## 僅能 / 主要依 E2E 驗收的項

**建議僅 E2E（或 E2E 為主）**：1、3、4、5（UI 佈局）、6、8、9、11、12、14、15、18、19、21、22（heap/長跑）、23、24。

**單元即可覆蓋（綠燈時優先）**：2、7、10、13、17、20（邏輯）、22（timer 累積 mock）。

## 與 PR #108 衝突、rebase 後需一併改的檔案

| 檔案 | 原因 |
| --- | --- |
| `index.html` | setup gate、`store-id` / `home-board-store` script |
| `js/app.js` | 店號解析與 boot 順序 |
| `js/receiver/cloud-boot.js` | 無店號不 boot、與 waiting 配對交錯 |
| `js/receiver/home-board-store.js` | #108 新增；item 16–17 測試依賴 |
| `js/store-id.js` | `isValidStoreIdFormat`（item 16、17） |
| `tests/e2e/harness.mjs` | `homeBoardUrl`（#108）；E2E 應改用 helper |
| `css/milksha-board.css` | setup / waiting overlay 樣式 |
| `js/board/board-auto-pair-host.js` | 配對失敗 vs waiting 分支 |
| `js/transport/board-bind-api.js` | `waiting_pair` / `invalid_store_format` |
| `tools/fake-cloud/server.mjs` | s999998 `waiting_pair`、測試 hook（seed/posReject） |

## 綠燈實作提示（非本輪範圍）

- 新增模組：`js/board/board-waiting-pair.js`、`js/board/board-waiting-pair-host.js`、`js/receiver/board-url-bind-sync.js`（測試已假設匯出名稱）。
- 合約常數：`tests/helpers/waiting-pair-contract.js`（`code: waiting_pair` / `invalid_store_format`、10s 重試、`formatWaitingPairLine`）。
- 測試店號：**僅 `s999998`**（fake-cloud）；`zz-qa-pair-01` 保留給自動建店情境（perf seed）。

## UAT（綠燈後給 PM）

1. 開 `/?mode=cloud&store=s999998`（fake-cloud、未建店）→ 畫面正中「店編號 s999998　等待配對中」，無取餐區、無「已綁定」。
2. 等 10 秒 → Network 再見 `boardAutoPair`；`/test/registerStore` 建店後 15 秒內進入正常看板。
3. `/?store=s0305769` →「請設定店編號」（#108 畫面）。
4. `motion=on` 同上；首次配對成功後號碼不播進場、停第 1 頁。
