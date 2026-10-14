# 控制端雲端票 `sourceType` 讀回（#65 → 修復）

## 根因（H1 + H2）

- **H1：** `ticketSourceKey` 未讀雲端 `sourceType`（字串或 `{ no, sourceType }` 嵌套）→ 預設 `store`。
- **H2：** `refreshBoardLists` map 未保留 `sourceType` / 正規化 `source_type` → 下一輪 `push_numbers` 全送 `From_Store_OK`。

## 修復

- 新增 `controller/controller-cloud-ticket-readback.js`（讀回 + map）。
- `controller-app.js` 的 `refreshBoardLists` / `ticketSourceKey` 改走上述模組。
- 資產版本：`20261014a`。

## 測試（CI / `npm test`）

```bash
npm test
# 含 tests/controller-sourcetype-readback.test.js
```

- H1：Uber `C7458` / 嵌套 `{ no: C7459, sourceType }` 讀回後 `push_numbers` 仍為 `From_UberEat_OK`。
- 回歸：依 QA pr64live 序（門市 → 迷點 **092** → Uber **C7459** → foodpanda → Udd），每送一筆後模擬雲端 readback，**先前號碼來源不變**。

## 假設結案

| # | 結果 |
|---|------|
| H1 | **成立**，已修 |
| H2 | **成立**（保留 `sourceType`），已修 |
| H3–H5 | 排除（Validate / PushNumbersParams 行為正確） |
