# 入口 A：`posReceiver` 請求驗證（與 milksha-cloud 對齊）

本文件描述 **milksha-qms-dev** 上 `posReceiver`（入口 A）的驗證規則。示範站 `milksha-demo` 的控制頁、本機 fake-cloud、local shim 與單元測試依此實作；正式行為以 [milksha-cloud PR #3](https://github.com/UltronService/milksha-cloud/pull/3) 合併後為準。

## HTTP 與回應形狀

- 一律回 **HTTP 200**（含驗證失敗、入口 A 關閉、簽章錯誤）。
- Body 為 JSON，至少包含：
  - `isSuccess`（boolean）
  - `information`（string，人類可讀原因）
  - 成功寫入看板時可含 `seq`（number）

範例（失敗）：

```json
{ "isSuccess": false, "information": "Md5Hash 不符" }
```

## `serviceSpecialData_Json_Md5Hash`

- **MD5 輸入**為 HTTP body 內 `serviceSpecialData_Json` 欄位的 **原始 JSON 文字**（UTF-8），與線路上收到的子 JSON **逐字節相同**（非先 parse 再 stringify）。
- 控制頁／fake-cloud：先用 `JSON.stringify(obj)`（無額外空白、不手動改 key 順序）得到 `innerText`，對 `innerText` 算 MD5，外層 body 以 **嵌入同一段 `innerText`** 的方式組出整份 JSON（`milksha-pos-wire.js`）。
- 過渡期後端可能仍接受「parse 後再 stringify」；示範站以 **raw 文字** 為準以對齊 milksha-cloud 即將上線的行為。

## `signature`（HMAC）

- 演算法：`Base64( HMAC-SHA256( key, canonical ) )`
- `key`：該環境 POS 簽章金鑰（**僅控制頁 localStorage**，不入 `#cfg=`）。
- **canonical 字串**（字面量 pipe，無空白）：

```text
{merchant_id}|{account}|{timeStmp}|{serviceSpecialData_Json_Md5Hash}
```

## `timeStmp`

- 格式：`YYYY-MM-DD-HH-mm-ss:XXXX`（例 `2026-10-03-09-15-00:0123`）；冒號後為 **0–999 毫秒**，左側補 0 至 **4 位**。
- 牆上時間為 **Asia/Taipei（UTC+8，無夏令時間）**；控制頁 `formatTimeStmp` 以 `Date` 瞬間 +8h 後用 **UTC getters** 組字串，與瀏覽器時區無關。
- 驗證端解析：欄位視為台北時間 `+08:00`；冒號後 **1–4 位數**、數值 **0–9999**（&gt;999 時取 `mod 1000` 作毫秒）。
- 與伺服器時間差 **超過 10 分鐘** 拒絕（`information`: `timeStmp 已過期`）；允許約 **60 秒** 未來時間。

## `target`

- `serviceSpecialData_Json.target` 必須等於 **`'milksha' + account`**（字串直接相接，例 account `s120030` → `milkshas120030`）。
- 不符時 `information`: `找不到目標叫號機`。

## 入口 A 開關

- 後端關閉入口 A 時：`isSuccess: false`，`information` 固定為 **`入口 A 未啟用`**（字串需完全一致）。

## 其他常見錯誤文案

| 條件 | `information` |
|------|----------------|
| 缺少或無效 JSON | `叫號資料格式錯誤` |
| Md5 不符 | `Md5Hash 不符` |
| timeStmp 格式錯 | `timeStmp 格式錯誤` |
| HMAC 不符 | `簽章錯誤` |
| 無線上叫號機 | `目標叫號機尚未連線`（`isSuccess` 可能為 false；不寫看板） |
| 成功 | `資料顯示成功` |

## 示範站實作位置

| 元件 | 路徑 |
|------|------|
| 瀏覽器驗證 | `js/transport/pos-receiver-validate.js` |
| 控制頁簽名 | `js/transport/milksha-pos-sign.js` |
| fake-cloud | `tools/fake-cloud/pos-validate.mjs`, `tools/fake-cloud/server.mjs` |
| 本機 local shim | `js/transport/local-cloud-shim.js` |
| Cloud API 客戶端 | `js/transport/cloud-api.js`（posReceiver 在 HTTP 200 時仍解析 body） |
