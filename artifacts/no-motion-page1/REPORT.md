# 無動畫看板：新號碼回第 1 頁

## 變更摘要
- 預設 URL（無 `motion=on`）：某區正在第 2 頁（含）之後，該區**新增**號碼時，同一輪更新立刻顯示第 1 頁，頁碼 `1/N` 同步。
- 準備中 → 請取餐：請取餐視為新增並回第 1 頁；準備中只少號不跳頁。
- 跳回第 1 頁時重設 6 秒翻頁計時。
- `motion=on` 行為不變。
- 資產版本：`20261012a`。
- PR：https://github.com/UltronService/milksha-demo/pull/60

## TDD（5 項邊界，red → green）
| # | 測試 | Red 現象 | Green |
|---|------|----------|--------|
| 1 | 第 2 頁收到新號（prep/ready、prep→ready） | `prep indicator page`：`1 !== 0` | `maybeJumpNoMotionZoneToPageOneOnNewItem` |
| 2 | 僅減少號碼 | （實作前若誤跳頁會失敗） | 無新增 id 不呼叫跳頁 |
| 3 | 僅 1 頁 | — | `pages <= 1` 早退；單測通過 |
| 4 | 跳回後計時器重算 ~6s | — | `scheduleZoneTimers()` + 假時鐘：+1s 仍第 1 頁、再 +5s 才第 2 頁 |
| 5 | `motion=on` 不強制回第 1 頁 | — | `isBoardMotionOn()` 閘門；仍停第 2 頁 |

檔案：`tests/board-no-motion-new-number-page1.test.js`  
本地：`npm test` 219 passed。

## CI
- Run（head `5869978`）：https://github.com/UltronService/milksha-demo/actions/runs/38201770397  
- `test`：pass  
- `e2e-live-cloud`：pass  

## UAT 快檢
1. 預設看板 URL，準備中 >10 筆，等第 2 頁後再送新準備號 → 立刻 `1/N` 且為最新那一頁內容。  
2. 請取餐同上；或準備中移一號到請取餐 → 請取餐回第 1 頁、準備中頁碼不變。  
3. `?motion=on` 重複 → 仍停原頁（舊行為）。
