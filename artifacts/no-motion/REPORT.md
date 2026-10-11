# 看板預設無動畫（motion 閘門）

## 變更摘要

- **預設網址**（無 `motion` 參數）：看板不再播放數字淡入、滑動、1.3 倍脈衝、欄位移動；換頁與清空改為**立即**更新 DOM 與頁碼指示。
- **`?motion=on`**：維持既有動畫邏輯，僅在閘門允許時才走 `milksha-board-anim.js` 路徑。
- 資產版本 bump：`20261011d`（`config/asset-version.json` 與各 HTML `?v=`）。
- README 新增 `motion=on` 一行說明。

## TDD 五項邊界（`tests/board-no-motion-default.test.js`）

| # | 測項 | 結果 |
|---|------|------|
| 1 | 預設 URL：加號／轉可取／移除／換頁／清空期間每 50ms 每格最多一顆 chip | 綠（先紅：`getAnimSkipReason` 非 `motion-off`／換頁 Promise）→ 閘門 + `patchZonePage` 回傳 Promise |
| 2 | 預設 URL：prep／ready 與 `getSnapshot()` 每 sample 一致 | 綠 |
| 3 | 預設 URL：payload 後 3s 內可見且 DOM 對齊 snapshot | 綠 |
| 4 | 預設 URL：無 float 層、無換頁／欄位 anim 旗標、無 inline 透明／scale；換頁指示與內容同步 | 綠 |
| 5 | `?motion=on`：`getAnimSkipReason()` 為 `animate`；既有 `animateReadyPulse` 取消後 opacity=1 | 綠；其餘動畫單元（`board-ready-fade-regression` 等）全 suite 214 pass |

本機：`npm test` → **214/214 pass**。

## CI

PR 建立後見下方 Actions 連結（合併前以 GitHub CI 為準）。

## 截圖（預設無 `motion=on`）

- 1080p：`artifacts/no-motion/screenshots/default-1080p.png`
- 4K：`artifacts/no-motion/screenshots/default-4k.png`

## 手動驗收（UAT）

1. 開 <https://ultronservice.github.io/milksha-demo/>（或本機 `/?demo=1`），**不要**加 `motion=on`。
2. 展示面板送一組準備中＋可取餐號碼 → 號碼應**直接**出現在格內，無淡入或放大。
3. 送超過 10 筆準備中，等 6 秒或切頁 → 頁碼與數字**同時**切換，無交叉淡化。
4. 清空 → 畫面**立刻**空白。
5. 同一網址加 `?motion=on`（可併 `demo=1`）→ 行為應與改版前動畫版相同。
