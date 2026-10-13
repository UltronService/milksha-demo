# posReceiver「叫號資料格式錯誤」— 結構化除錯（僅假設，未修後端／控制端）

> 店別：**`zz-qa-ci-store`**（勿用 `zz-qa-store-a`）  
> 機密：`<REDACTED>`  
> 測後已 **`clear_now` 清空**該店。

## 錯誤來源（看板 vs 雲端）

| 層級 | 結果 |
|------|------|
| 看板端送出前 | **未拒絕**（控制端完成簽名並 POST；無 client throw） |
| HTTP | **`POST posReceiver` → 200 OK** |
| 雲端回應本體 | **`isOK: false`**，`information` 內嵌 JSON：`isSuccess:false`, **`information":"叫號資料格式錯誤"`**（`CallingNumberMasterResponse.statusCode` 字串 `"200"` 為內層 POS 包裝，非 HTTP 失敗） |

**結論：** 訊息由 **雲端／POS 接收鏈** 回傳，**不是**看板 `partitionNumberContent` 第二道過濾。

## 可重現命令

```bash
cd /path/to/milksha-demo
LIVE_CLOUD_STORE_ID=zz-qa-ci-store node scripts/repro-posreceiver-format-error.mjs
```

- 腳本會：連真雲 `milksha-qms-dev`、對 **`zz-qa-ci-store`** 組 PR #22 假資料 → **`number_content`** → **`posReceiver`** 簽名 POST → 寫 `artifacts/delivery-number/format-error-repro.json` → **`clear_now`**。
- **端點：** `https://asia-east1-milksha-qms-dev.cloudfunctions.net/posReceiver`  
- **Auth：** 請求帶 Pages 內建 Firebase 設定（apiKey / posSignSecret 等皆 **`<REDACTED>`**；見 repo `config/firebase.js` 或 GitHub Pages 覆寫）。

### 本次送出的完整 `number_content`（邏輯內容）

由 `tests/fixtures/today-board-cloud-tickets.js` ＋ 同號不同來源兩筆，經 **分支** `ticketsToNumberContent` 轉換：

```json
[
  { "source_type": "From_milksha_point_OK", "number": "578" },
  { "source_type": "From_UberEat_OK", "number": "C7458" },
  { "source_type": "From_FoodPanda_OK", "number": "6406" },
  { "source_type": "From_Store_OK", "number": "7112" },
  { "source_type": "From_Store_OK", "number": "8888" },
  { "source_type": "From_UberEat_OK", "number": "8888" }
]
```

外層 POS 包（摘要）：`merchant_id: milksha`，`account: zz-qa-ci-store`，`serviceSpecialData_Json.target: milkshazz-qa-ci-store`，`isEncrypt: false`，另含 `timeStmp`／`signature`／`serviceSpecialData_Json_Md5Hash`（**`<REDACTED>`**）。

### HTTP 快照（2026-10-13 UTC 重跑）

| 項目 | 值 |
|------|-----|
| URL | `https://asia-east1-milksha-qms-dev.cloudfunctions.net/posReceiver` |
| Method | POST |
| **HTTP status** | **200** |
| Body（摘要） | `isOK:false`, `information:"{\"isSuccess\":false,\"information\":\"叫號資料格式錯誤\"}"` |

完整機器可讀：`artifacts/delivery-number/format-error-repro.json`

## 可驗證假設（可能性由高到低）

1. **入口 A／`posReceiver` 仍只接受舊版門市 `number_content` 規則**（例如每列必為門市四碼、`source_type` 組合不在白名單），PR #22 的 **`today_board.tickets[]` + `sourceType`** 尚未接到此 HTTP 入口。  
   - *驗證：* 後端查同一 payload 的 validator 日誌；或只送一筆 `From_Store_OK`/`7112` 對照（預期成功）。

2. **QA 應走 POS 正式格式直打雲端**（總監路線），而非 demo 控制端組的 legacy `number_content` 多來源整包；目前 repro 故意模擬「整包 `number_content`」以對齊舊 Tammy 路徑。  
   - *驗證：* 用 POS 規格書 wire 格式送同一組號，看是否仍 格式錯誤。

3. **同批內重複鍵**（兩筆 `8888` 不同 `source_type`）在 **接收端** 尚未支援，整批拒絕。  
   - *驗證：* 去掉兩筆 `8888` 或只留一筆再 POST，比對 `isOK`。

4. **迷點／外送列與門市混在同一 `number_content` 時，雲端 schema 版本未開**（feature flag／店別設定）。  
   - *驗證：* 僅送單一來源一筆（578 only / C7458 only）分四次試。

5. **`target`／`account`／簽名欄位與 payload 不一致導致進錯 validator 分支**（機率較低；HTTP 200 且訊息為「格式」而非簽名錯）。  
   - *驗證：* 後端對照 `zz-qa-ci-store` 白名單與 target 對照表。

## 與 CI 失敗 run `38269937500` 的關係

- 該 run **與本錯誤無關**：`test` job 失敗為 e2e **`board-column-move.spec.mjs`** 動畫時序偶發（換欄 enter-from-above 未取樣到 transform）；**`e2e-live-cloud` 仍綠**。本地重跑同一 case **通過** → 屬偶發，非 posReceiver。
