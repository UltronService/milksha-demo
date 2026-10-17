# POS2756 APK 測試頁 — REPORT

## Step 0：Firestore `LianFaServerLog`（`ultron-player-2022`）可否由網頁讀取

| 項目 | 結果 |
|------|------|
| repo 內是否有 `ultron-player-2022` Web SDK 設定 | **否** — `milksha-demo` 僅有 `config/firebase.js`（`milksha-qms-dev`）；org 程式碼搜尋無 `ultron-player-2022` / `LianFaServerLog` 設定檔 |
| 未登入網頁能否讀集合 | **可以（唯讀）** — Firestore REST `documents:runQuery` 與 `documents/LianFaServerLog` 在未帶 OAuth 時回 **HTTP 200**（代表 Security Rules 允許公開讀取此集合；**未**修改任何 rules／設定／資料） |
| `deviceId == 5848` 篩選 | 使用 **`stringValue: "5848"`** 有資料；**`integerValue: 5848`** 查無結果 → 欄位型別為 **字串** |
| 實作方式 | 測試頁以 `fetch` POST 至 `https://firestore.googleapis.com/v1/projects/ultron-player-2022/databases/(default)/documents:runQuery`（**不需** Web API key；仍為唯讀） |
| 若日後讀不到時的替代 | ① 由後端／Cloud Function 代理並下發短期 token；② APK 改走本機 HTTP 2757 健康檢查；③ 僅保留下方 `getOrderStatus` 日誌區（規格 8 已要求上方失敗時下方仍可用） |

**風險（給 PM）：** 此集合目前對外可讀，含 `receiveData` 等除錯內容；本頁僅 QA 用、不寫入，但公開可讀本身為正式環境資安議題（與 vendor-spec「Release 勿大量上傳」同一脈絡）。

## 規格 ↔ 測試對照

| # | 規格摘要 | 測試（`tests/pos2756-test.test.js`） |
|---|----------|--------------------------------------|
| 1 | `/pos2756-test/?type=ticketmachine` 新頁；不動 `js/board/*` | `spec 1` |
| 2 | 第一支 script 即 `window.getOrderStatus` / `getSoldoutItem` | `spec 2` |
| 3 | 每次 `getOrderStatus` 一列：台北時間 + 原始參數 | `spec 3` |
| 4 | 三次呼叫三列，新在上 | `spec 4` |
| 5 | 空／怪輸入仍一列、不 throw | `spec 5` |
| 6 | `getSoldoutItem` 一列且標示 | `spec 6` |
| 7 | 上方讀 `deviceId=5848`、最新 `receiveTime`、**本頁開啟後**筆數 | `spec 7` |
| 8 | 讀不到顯示「讀不到」+ 原因；下方仍運作 | `spec 8`（下方行為由 `pos2756-test-page.js` 與 spec 5/6 涵蓋） |
| 9 | 下方最多 200 列 | `spec 9` |
| 10 | 無欄位版型／動畫／聲音；唯讀 ultron | `spec 10` |

## 測試結果

```text
node --test tests/pos2756-test.test.js → 10/10 pass
npm test → 全 suite 302 項；其中 10 項失敗為 main 上既有 PR #74 對齊測試（與本 PR 無關）；**本 PR 新增 10 項全過**
```

## PR

（推送後由 Cloud Agent 填入連結）

## 如何開啟頁面

| 環境 | URL |
|------|-----|
| GitHub Pages（合併後） | `https://ultronservice.github.io/milksha-demo/pos2756-test/?type=ticketmachine` |
| 本機 | 於 repo 根目錄：`npx --yes serve -p 8080 .` → `http://localhost:8080/pos2756-test/?type=ticketmachine` |

**UAT（非技術）**

1. 用機上盒／Chrome 開上表 URL，確認上方出現 `deviceId=5848` 與「本頁開啟後筆數」（可為 0）。
2. 在開發者工具 Console 執行：`getOrderStatus('{"preparing":[],"done":["9001"]}')` → 下方新增一列，含台北時間與完整字串。
3. 再執行兩次不同內容 → 共三列，最上面是最新的一列。
4. 執行 `getSoldoutItem('test')` → 出現含 `getSoldoutItem` 字樣的一列。
5. 斷網後重載：上方應顯示「讀不到」與原因；步驟 2 的 Console 呼叫仍可在連線恢復後寫入下方（或斷網時僅驗證不當機）。

## 02:45 Asia/Taipei 交付

**可於期限前交付 QA**（本報告撰寫時 UTC 2026-10-17 17:16，距 02:45 台北仍有餘裕）。
