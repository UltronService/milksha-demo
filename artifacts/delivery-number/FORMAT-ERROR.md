# posReceiver「叫號資料格式錯誤」— 已查明（測試腳本簽章問題）

> **結論：** 後端日誌為 **`signature_invalid`**（在校驗號碼前即拒絕）。**不是**看板第二道過濾，**不是**雲端 business 規則拒絕 578／外送號。  
> **根因：** 本 repo 探測腳本送出的 POS 包 **簽章無效**（`merchant_id` 大小寫、`posSignSecret`、canonical 字串與 wire 內 `timeStmp`／Md5 須一致）。  
> **店別：** `zz-qa-ci-store`（勿用 `zz-qa-store-a`）。機密 **`<REDACTED>`**。

## 後端對照（已確認）

| 時間（後端紀錄） | 店 | 後端判定 |
|------------------|-----|----------|
| 10/12 23:21:18 | zz-qa-ci-store | **signature_invalid** |
| 10/13 12:09:50 | zz-qa-ci-store | **signature_invalid** |
| 10/13 12:10:26 | zz-qa-ci-store | **signature_invalid** |

HTTP 仍可能 **200**，body 內 **`isOK: false`** 且 `information` 嵌 JSON 文案 **「叫號資料格式錯誤」** — 為 **POS 包裝用語**，與後端內部 **簽章失敗** 一致，勿當成號碼格式問題。

## 腳本哪裡送錯

| 項目 | 錯誤送法（探測當時） | 應為 |
|------|----------------------|------|
| `merchant_id` | 小寫 `milksha`（來自 demo `Validate` 店別表） | **`Milksha`**（後端成功紀錄用大寫 M） |
| `posSignSecret` | GitHub Pages `config/firebase.js` 占位 **`fake-…`**（35 字元） | dev 真實 POS 簽章金鑰（**`<REDACTED>`**，勿 commit） |
| 簽章 canonical | `merchant_id\|account\|timeStmp\|serviceSpecialData_Json_Md5Hash` | 須與 **實際 POST wire** 內四欄 **逐字相同**（`MilkshaPosWire.signPosWire` 已保 inner JSON 與 Md5 一致） |

**已修（僅測試腳本，未改功能程式）：** `scripts/repro-posreceiver-format-error.mjs`、`scripts/live-cloud-pos-screenshot.mjs` 固定 `merchant_id: 'Milksha'`；可選 **`MILKSHA_POS_SIGN_SECRET`** 注入覆寫 Pages 占位金鑰。

## 可重現命令

```bash
# 本機須設定 dev POS 簽章金鑰（勿寫進 repo）
export MILKSHA_POS_SIGN_SECRET='<REDACTED>'

cd /path/to/milksha-demo
LIVE_CLOUD_STORE_ID=zz-qa-ci-store node scripts/repro-posreceiver-format-error.mjs
# 可選：簽章 OK 後截 1080p
LIVE_CLOUD_STORE_ID=zz-qa-ci-store node scripts/live-cloud-pos-screenshot.mjs
```

- **端點：** `POST https://asia-east1-milksha-qms-dev.cloudfunctions.net/posReceiver`  
- **範例 `number_content`（PR #22 轉換後）：** 578 迷點、`C7458` Uber、`6406` 熊貓、`7112` 門市、同號 `8888` 門市＋Uber（見 `tests/fixtures/today-board-cloud-tickets.js`）。  
- **測後：** 腳本會 **`clear_now`** 清空 `zz-qa-ci-store`。

## 看板 vs 雲端（釐清）

| 層 | 行為 |
|----|------|
| 看板端 | 未攔截；腳本在瀏覽器內簽完即 POST |
| HTTP | 200 |
| 雲端（簽章錯時） | **`signature_invalid`** → 對外常顯 **叫號資料格式錯誤** |

## 與 `push_numbers` 的關係

- 控制端雲端 **`push_numbers`** **不收** 迷點 `578` 等 — **核准行為**（非本議題 bug）。  
- 外送／迷點 **真雲端驗收** 由 **QA 依 POS 格式直打雲端**（總監路線）；勿改控制端。

## CI run `38269937500`

與簽章無關：`board-column-move.spec.mjs` 換欄動畫 **偶發** 未取樣到 enter-from-above；`e2e-live-cloud` 仍綠。本地重跑該 case 可過。
