# 外送／迷點號碼格式 — 看板實作 REPORT

> 分支：`cursor/delivery-number-format-d947`  
> PR：https://github.com/UltronService/milksha-demo/pull/62  
> 資產版本：`20261013a`（QA live2 修正 bump）  
> 機密：`<REDACTED>`

## QA live2 除錯（bc-f240fa90 · `artifacts/pr62pre/REPORT-live2.md`）

| 假設 | 內容 | 結果 |
|------|------|------|
| **H1** | 不認得的 `sourceType` 整列被 skip（舊版無 `From_*_(OK\|Preparing)` 兜底）→ 含英數碼如 `A1B` 不顯示 | **成立** |
| **H2** | 雲端拼字 `From_UberEats_*` 未對上 `From_UberEat_*` → Uber 列 skip；若只剩門市 `1234` 則只見 1 格 | **成立** |
| **H3** | 畫格／去重 key 只看號碼 | **不成立**（`745731b` 起已 `makeItemId(sourceKey, number)`） |
| **H4** | 雲端 payload 本身只有一筆 | **排除**（QA tickets 形狀為兩筆同號不同來源） |

**修正（本 head）：**

- `parseSourceType`：`SOURCE_TYPE_ALIASES`（`From_UberEats_` → `uber`）；未知 `From_*_(OK|Preparing)` → `sourceKey: unk:<prefix>`。
- `normalizeBoardDisplayNumber`：門市嚴格 4 位；迷點 3–4 位；熊貓 3–6 位；其餘來源 **3–6 英數大寫**（非 1–6）。
- 回歸：`tests/delivery-number-qa-live2.test.js`（真雲端 tickets 形狀 + `sourceType` 原字串）。

## 去重鍵（與後端 PR #22 對齊）

- 雲端 `today_board.tickets[]`：`{ no, status, sourceType?, updatedAt }`；缺 `sourceType` → 門市。
- 看板去重：**來源通道＋正規化 `no`**（`makeItemId`）。
- 同來源同號一筆；**不同來源同號** → 兩格並存。

## 變更摘要

| 項目 | 說明 |
|------|------|
| **What** | live2：`UberEats` 別名、未知來源解析、3–6 英數規則、迷點／熊貓分規則；QA 回歸測試。 |
| **Why** | QA 真雲端只見 1 格／英數碼消失。 |
| **How to test** | `npm test`（含 `delivery-number-qa-live2.test.js`）。 |

## 驗收表

| # | 邊界 | 結果 |
|---|------|------|
| 1 | 門市只收 4 位數字 | ✅ |
| 2 | 迷點 `091`／`578` 保留前導 0 | ✅ |
| 3 | 同來源 `#6406` 與 `6406` 只一筆 | ✅ |
| 4 | Uber 英文轉大寫 `C7458` | ✅ |
| 5 | 不同來源同號兩筆（含 `From_UberEats_OK`） | ✅ live2 |
| 6 | 未知來源 `A1B`（3–6 英數） | ✅ live2 |
| 7 | PR #22 形狀 tickets → 上板 | ✅ |
| 8 | `npm test` | ✅ 229 |
| 9 | CI | 見下（待本 push 更新） |
| 10 | 無動態版本地截圖 | ✅（`20261012c` 時期產物，邏輯同） |
| 11 | 真雲端 `zz-qa-ci-store` 四來源＋同號 | ⚠️ 需後端代送（見下） |

## CI

| Run | head | 結果 | 說明 |
|-----|------|------|------|
| [38352014789](https://github.com/UltronService/milksha-demo/actions/runs/38352014789) | `28662bc` | ✅ | 修正前最後全綠 |
| [38380727226](https://github.com/UltronService/milksha-demo/actions/runs/38380727226) | `af85f87` | ⚠️ | `e2e-live-cloud` ✅；`test` ❌ `board-column-move` 偶發（非本 PR 邏輯） |
| **（重跑）** | **`fdee07b`** | **待跑** | 空 commit 重觸 |

PR Checks：https://github.com/UltronService/milksha-demo/pull/62/checks

## 真雲端需後端代送（`zz-qa-ci-store`，POS／ticket 寫入）

控制端 **`push_numbers` 無 `sourceType`**，無法驗四來源；**posReceiver** 需 `<REDACTED>` 簽章。請後端以 **`today_board.tickets[]`**（或 PR #22 等價）寫入：

| # | `no` | `status` | `sourceType`（雲端原字串） | 預期 |
|---|------|----------|---------------------------|------|
| 1 | `578` | `ready` | `From_milksha_point_OK` | 迷點 1 格 |
| 2 | `C7458` | `ready` | `From_UberEat_OK` 或 `From_UberEats_OK` | Uber 1 格 |
| 3 | `6406` | `ready` | `From_FoodPanda_OK` | 熊貓 1 格（無 `#`） |
| 4 | `7112` | `ready` | （省略＝門市） | 門市 1 格 |
| 5 | `8888` | `ready` | （省略＝門市） | 與 #6 並存 2 格 |
| 6 | `8888` | `ready` | `From_UberEats_OK` | 同上 |
| 7 | `1234` | `ready` | （省略） | live2：與 #8 並存 2 格 |
| 8 | `1234` | `ready` | `From_UberEats_OK` | 同上 |
| 9 | `A1B` | `ready` | `From_CustomPartner_OK`（或任一未建別名之 `From_*_OK`） | 未知來源 1 格 |

測後請 **`clear_now`**。勿用 `zz-qa-store-a`。

## UAT（非工程 · 本地 · 無 `motion=on`）

1. 開 `index.html?mode=local&orientation=landscape`。
2. Console：
   ```javascript
   const tickets = [
     { no: '1234', status: 'ready', updatedAt: '2026-10-13T10:00:00.000Z' },
     { no: '1234', status: 'ready', sourceType: 'From_UberEats_OK', updatedAt: '2026-10-13T10:00:01.000Z' },
     { no: 'A1B', status: 'ready', sourceType: 'From_CustomPartner_OK', updatedAt: '2026-10-13T10:00:02.000Z' },
   ];
   QMS.runtime.applyPayload(QMS.Board.TodayBoard.ticketsToNumberContent(tickets));
   ```
3. 右欄應見 **1234（兩格）** 與 **A1B**。
