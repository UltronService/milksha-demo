# POS intake log feed（對齊 milksha-cloud PR #42）

`GET posIntakeLogFeed?storeId=&limit=`

## 回應

- `{ "status": "ok", "records": [...] }`
- `{ "status": "已停用" }`

## 單筆 record 欄位（來源：test cloud 實際回應）

| 欄位 | 說明 |
|------|------|
| `id` | 文件 id |
| `storeId` | 門市 |
| `deviceId` | 機台（可 null） |
| `source` | 入口（例 `posReceiver`） |
| `clientIp` | 來源 IP |
| `httpStatus` | HTTP 狀態 |
| `disposition` | `accepted` / `rejected` / `skipped` |
| `rejectReason` | 拒絕原因（可 null） |
| `readyCount` / `preparingCount` | 分區筆數 |
| `readyNumbers` / `preparingNumbers` | 字串陣列 |
| `bodyByteSize` | 請求 body 大小 |
| `requestSignature` | 簽章（展示一律 `<REDACTED>`） |
| `receivedAtMs` | 收件時間（epoch ms） |
| `posSentAtMs` | POS 送件時間（ms，可 null） |
| `posTimeStmpRaw` | POS 原始 timeStmp 字串（≤64，可 null） |

## QA 頁面對照

| API | UI |
|-----|-----|
| `storeId` | 門市 |
| `source` | 入口 |
| `clientIp` | 來源 IP |
| `readyCount` / `preparingCount` | 請取餐 / 準備中 |
| `readyNumbers` / `preparingNumbers` | 展開列號碼 |
| `disposition` | 結果 Tag |
| `rejectReason` | 拒絕原因 |
| `bodyByteSize` + redacted signature | raw 區塊 |
| `receivedAtMs` | 收件時間（台北） |
| `posSentAtMs` | 送件時間（台北含 ms） |
| `(receivedAtMs - posSentAtMs) / 1000` | 作業時間（秒，三位小數） |
| `posTimeStmpRaw`（`posSentAtMs` 缺） | 表格「格式錯誤」；展開列顯示 raw 文字 |

空值顯示 `—`；數值 `0` 顯示 `0`；作業時間 `0` 顯示 `0.000`。
