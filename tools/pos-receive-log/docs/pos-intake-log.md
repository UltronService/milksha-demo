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

## QA 頁面表格欄位（UI 標題）

| 順序 | UI 欄位名稱 |
|------|-------------|
| 1 | 收件時間（Taipei） |
| 2 | 送件時間 |
| 3 | 作業時間（秒） |
| 4 | 門市 |
| 5 | 入口 |
| 6 | 來源 IP |
| 7 | 請取餐 |
| 8 | 準備中 |
| 9 | 結果 |

## API → UI 對照

| API | UI 欄位名稱 |
|-----|-------------|
| `receivedAtMs` | 收件時間（Taipei） |
| `posSentAtMs` | 送件時間 |
| `(receivedAtMs - posSentAtMs) / 1000` | 作業時間（秒） |
| `storeId` | 門市 |
| `source` | 入口 |
| `clientIp` | 來源 IP |
| `readyCount` | 請取餐 |
| `preparingCount` | 準備中 |
| `disposition` | 結果 |
| `readyNumbers` / `preparingNumbers` | 展開列（請取餐／準備中區塊內號碼） |
| `rejectReason` | 展開列「拒絕送出」 |
| `bodyByteSize` + redacted signature | 展開列 raw payload |
| `posTimeStmpRaw`（`posSentAtMs` 缺） | 送件時間欄「格式錯誤」；展開列 POS timeStmp（raw） |
| `boxReports[]`（假設欄位，見 PR） | 展開列「盒子回報」子表；無資料顯示「未回報」 |

空值顯示 `—`；計數欄位數值 `0` 顯示 `0`；作業時間（秒）真實 `0` 顯示 `0.000`。
