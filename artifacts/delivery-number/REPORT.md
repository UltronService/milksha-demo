# 外送／迷點號碼格式 — 看板實作 REPORT

> 分支：`cursor/delivery-number-format-d947`  
> 資產版本：`20261012b`  
> 機密：`<REDACTED>`

## 變更摘要

| 項目 | 說明 |
|------|------|
| **What** | `normalizeBoardDisplayNumber` 依來源鍵分規則；`partitionNumberContent` 以「來源＋號碼」去重；`ticketsToNumberContent` 支援 `sourceType`。 |
| **Why** | 外送／迷點非四碼；同號不同來源須並存；熊貓不顯示 `#`。 |
| **How to test** | `npm test`；無 `motion=on` 開 `?mode=local&orientation=landscape` 餵四筆樣本。 |

## 驗收表

| # | 邊界 | 結果 |
|---|------|------|
| 1 | 門市只收 4 位數字 | ✅ `tests/delivery-number-format.test.js` |
| 2 | 迷點 `091` 保留前導 0 | ✅ |
| 3 | 同來源 `#6406` 與 `6406` 只一筆 | ✅ |
| 4 | Uber 英文轉大寫 `C7458` | ✅ |
| 5 | 不同來源同號兩筆都顯示 | ✅ |
| 6 | 超過 6 字元丟棄 | ✅ |
| 7 | PR #22 形狀 `tickets[]`（`no`／`sourceType?`）→ 上板 | ✅ |
| 8 | 全單元測試 `npm test`（226） | ✅ 本地 |
| 9 | E2E（非 live-cloud） | ⏳ 見 CI |
| 10 | 無動態版 1080p／4K 截圖 | ✅ 見下 |

## 無動態版截圖（578 迷點、C7458 Uber、6406 熊貓、7112 門市）

| 解析度 | 檔案 |
|--------|------|
| 1920×1080 | `artifacts/delivery-number/board-static-1920x1080.png` |
| 3840×2160 | `artifacts/delivery-number/board-static-3840x2160.png` |

產生：`node scripts/capture-delivery-number-board.mjs`

## CI

| Job | 連結 |
|-----|------|
| PR Checks | https://github.com/UltronService/milksha-demo/pull/62/checks |

## UAT（非工程）

1. 開 `index.html?mode=local&orientation=landscape`（**不要**加 `motion=on`）。
2. 開發者工具 Console 貼上並 Enter（假資料同 milksha-cloud PR #22 `today_board.tickets[]`）：
   ```javascript
   const tickets = [
     { no: '578', status: 'ready', sourceType: 'From_milksha_point_OK', updatedAt: '2026-10-12T22:00:00.000Z' },
     { no: 'C7458', status: 'ready', sourceType: 'From_UberEat_OK', updatedAt: '2026-10-12T22:00:01.000Z' },
     { no: '6406', status: 'ready', sourceType: 'From_FoodPanda_OK', updatedAt: '2026-10-12T22:00:02.000Z' },
     { no: '7112', status: 'ready', updatedAt: '2026-10-12T22:00:03.000Z' },
   ];
   QMS.runtime.applyPayload(QMS.Board.TodayBoard.ticketsToNumberContent(tickets));
   ```
3. 右欄「可取餐」應同時看到 **578、C7458、6406、7112**，且 **6406 前沒有 #**。
