# 外送／迷點號碼格式 — 看板實作 REPORT

> 分支：`cursor/delivery-number-format-d947`（head `745731b`）  
> PR：https://github.com/UltronService/milksha-demo/pull/62  
> 資產版本：`20261012c`  
> 機密：`<REDACTED>`

## 去重鍵（與後端 PR #22 對齊）

- 雲端 `today_board.tickets[]`：`{ no, status, sourceType?, updatedAt }`；缺 `sourceType` → 門市。
- 看板 `partitionNumberContent` 去重鍵為 **`makeItemId(sourceKey, normalizedNo)`**（即 **來源通道＋正規化後 `no`**）。`sourceKey` 由完整 `sourceType` 前綴解析（`store`／`point`／`fp`／`uber`／`udd`），**不是**只看號碼字串。
- 同 **`sourceType` 家族＋同一 `no`** → 一筆（例熊貓 `#6406` 與 `6406` 正規化後皆 `6406`）；**不同來源同號** → 兩筆並存。

## 變更摘要

| 項目 | 說明 |
|------|------|
| **What** | `normalizeBoardDisplayNumber` 依來源鍵分規則；`partitionNumberContent` 以「來源＋號碼」去重；`ticketsToNumberContent` 讀 `ticket.sourceType`。 |
| **Why** | 外送／迷點非四碼；同號不同來源須並存；熊貓不顯示 `#`。 |
| **How to test** | `npm test`；假資料 `tests/fixtures/today-board-cloud-tickets.js`。 |

## 驗收表

| # | 邊界 | 結果 |
|---|------|------|
| 1 | 門市只收 4 位數字 | ✅ 單元 |
| 2 | 迷點 `091` 保留前導 0 | ✅ 單元 |
| 3 | 同來源 `#6406` 與 `6406` 只一筆 | ✅ 單元 |
| 4 | Uber 英文轉大寫 `C7458` | ✅ 單元 |
| 5 | 不同來源同號兩筆都顯示 | ✅ 單元 |
| 6 | 超過 6 字元丟棄 | ✅ 單元 |
| 7 | PR #22 形狀 `tickets[]` → 上板 | ✅ 單元 |
| 8 | `npm test`（227） | ✅ 本地 |
| 9 | CI（見下） | 見 CI 小節 |
| 10 | 無動態版本地截圖 1080p／4K | ✅ |
| 11 | 真雲端 `zz-qa-ci-store` 四來源＋同號 | ⚠️ **控制端無法送齊**（見下） |

## CI

| Run | head | 結果 | 說明 |
|-----|------|------|------|
| [38265062923](https://github.com/UltronService/milksha-demo/actions/runs/38265062923) | `745731b` | ✅ | 全綠 |
| [38269937500](https://github.com/UltronService/milksha-demo/actions/runs/38269937500) | `d64e2b9` | ❌→重跑 | `test` e2e **`board-column-move`** 換欄動畫偶發；`e2e-live-cloud` ✅；見 `FORMAT-ERROR.md` |
| PR Checks | 最新 head | ⏳ | https://github.com/UltronService/milksha-demo/pull/62/checks |

posReceiver 探測：**`artifacts/delivery-number/FORMAT-ERROR.md`**（已查明：`signature_invalid`／腳本 `merchant_id`+金鑰；真雲端截圖需 `MILKSHA_POS_SIGN_SECRET`，本 CI VM 未配置）

## 無動態版本地截圖（578／C7458／6406／7112）

| 解析度 | 檔案 |
|--------|------|
| 1920×1080 | `artifacts/delivery-number/board-static-1920x1080.png` |
| 3840×2160 | `artifacts/delivery-number/board-static-3840x2160.png` |

產生：`node scripts/capture-delivery-number-board.mjs`（PR #22 形狀假資料 → `ticketsToNumberContent`）

## 真雲端小驗證（`zz-qa-ci-store`，未用 `zz-qa-store-a`）

**時間：** 2026-10-12 UTC；看板載入本 PR 之 `milksha-board.js`（Playwright github.io 路由 shim）。

| 嘗試 | 結果 |
|------|------|
| 控制端雲端模式「送整份名單」→ `devCommand` **`push_numbers`** | 僅 **門市四碼**可靠上板（例 **`7112`**）；**迷點 `578` 無上板**；外送號是否帶 `sourceType` **無法透過此路徑驗證**（雲端指令只有 ready/preparing 號碼陣列，無 `sourceType`）。 |
| 同路徑 POS 模擬器多來源＋**同號 `8888`（門市＋Uber）** | 上板失敗／無法確認雙筆同號。 |
| 控制端 **`posReceiver` + PR #22 形狀 `number_content`**（繞過 UI） | 雲端回 **`叫號資料格式錯誤`**，無上板。 |
| 控制端 **「快速送一筆門市號」**（`push_numbers`） | ✅ 上板（例 `2001`）；測後 **`clear_now` 清空**。 |

**結論：** 在 **不改功能範圍** 前提下，**無法**於 dev 雲端用現有控制端完成「四來源樣本＋同號不同來源」端到端驗證；需後端／控制端提供 **帶 `sourceType` 的 ticket 寫入**（或接受 PR #22 入口）後再測。單元測試與本地截圖已覆蓋看板行為。

| 真雲端 1080p（僅門市 quick send 實拍） | 檔案 |
|----------------------------------------|------|
| `zz-qa-ci-store` | `artifacts/delivery-number/live-cloud-zz-qa-ci-store-1920x1080.png` |

探測腳本：`LIVE_CLOUD_STORE_ID=zz-qa-ci-store node scripts/live-qa-delivery-number-zz-qa-ci-store.mjs`

## UAT（非工程 · 本地）

1. 開 `index.html?mode=local&orientation=landscape`（**不要** `motion=on`）。
2. Console：
   ```javascript
   const tickets = [
     { no: '578', status: 'ready', sourceType: 'From_milksha_point_OK', updatedAt: '2026-10-12T22:00:00.000Z' },
     { no: 'C7458', status: 'ready', sourceType: 'From_UberEat_OK', updatedAt: '2026-10-12T22:00:01.000Z' },
     { no: '6406', status: 'ready', sourceType: 'From_FoodPanda_OK', updatedAt: '2026-10-12T22:00:02.000Z' },
     { no: '7112', status: 'ready', updatedAt: '2026-10-12T22:00:03.000Z' },
   ];
   QMS.runtime.applyPayload(QMS.Board.TodayBoard.ticketsToNumberContent(tickets));
   ```
3. 右欄應見 **578、C7458、6406、7112**（**6406 無 `#**）。
