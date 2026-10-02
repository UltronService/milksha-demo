# 叫號看板控制端 `/controller/`

## 資料格式（與 milksha-cloud 定案一致）

| 路徑 | 說明 |
|------|------|
| `stores/{storeId}/board/today_board` | 看板整份名單（唯讀 REST，Bearer） |
| `stores/{storeId}/devices/{deviceId}` | 機上盒狀態與 `pendingCommand`（唯讀 REST） |
| `stores/{storeId}/logs` | **待後端確認** 路徑模板，預設可讀操作紀錄 |

`today_board` 欄位：`storeId`、`businessDate`（台北 YYYY-MM-DD）、`seq`、`updatedAt`、`source`（`A`/`B`/`system`）、`tickets[]`（`no`、`status`: `preparing`/`ready`、`updatedAt`）、`clearedAt`。

寫入僅能經雲端函式（Bearer）：`devLogin`、`heartbeat`、`devCommand`、`posIngest`（名稱與 body **待後端確認**）。

## 模式

- **local**：同瀏覽器 `localStorage` + 內建 shim，格式與 Firestore 相同。
- **firestore**：REST 讀取 + 函式寫入。預設模擬器；測試可設 `?gateway=127.0.0.1:8787` 對 `tools/fake-cloud/`。

## 待與後端對齊

- `posIngest` 函式名稱與 Request body
- 簽章算法與正式金鑰
- 紀錄集合路徑與查詢方式
- 雲端函式區域、正式 `projectId` / `apiKey`
