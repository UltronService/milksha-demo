# 看板即時監聽 — 前端需求清單

> **規則與路徑以 [milksha-cloud](https://github.com/UltronService/milksha-cloud) `main`（≥ `9940daf`）與 `docs/dev-api.md` 為準。** 本文件只列前端依賴的資料與行為，不另定安全規則。

## 登入（不變）

| 項目 | 需求 |
|------|------|
| 端點 | `POST …/devLogin` |
| 看板 body | `{ storeId, role: "device", deviceId }` |
| 控制端 body | `{ storeId, role: "controller", deviceId: "controller-web" }` |
| 回應 | **`customToken`**（Firebase custom token；claim 含 `storeId`、`deviceId`、`role`） |
| 後續 | `signInWithCustomToken` → Firebase JS SDK；**勿**定時重叫 `devLogin`；僅 SDK 認證失敗時再 `devLogin`（退避、不可迴圈） |

## Firestore 讀取範圍（看板 `role: device`）

| 路徑 | 用途 |
|------|------|
| `stores/{storeId}/board/today_board` | 叫號名單 |
| `stores/{storeId}/devices/{deviceId}/control/pending` | 遠端指令（優先） |
| `stores/{storeId}/devices/{deviceId}` | 僅讀 `pendingCommand`（`control/pending` 不可用時） |

- **禁止**：讀其他店、list 集合、任何客戶端寫入。
- **控制端**：不建立 `onSnapshot`。

## `today_board` 欄位（前端套用邏輯依賴）

| 欄位 | 說明 |
|------|------|
| `seq` | 單調遞增；套用／競態判斷（#30） |
| `updatedAt` | ISO 時間；`clear_now` 與 `issuedAtMs` 比對 |
| `storeId`, `businessDate`, `source`, `tickets`, `clearedAt` | 既有 `TodayBoard.normalizeTodayBoard` |

## 指令（`control/pending` 或 `devices/{deviceId}.pendingCommand`）

| 欄位 | 說明 |
|------|------|
| `id` | 指令唯一 id；去重、heartbeat `ackCommandId` |
| `type` | `reload` / `reboot` / `clear_now` / `push_numbers` / … |
| `boardSeq` | 發指令當下 `today_board.seq`（#30 `resolveCommandBoardSeq` 優先） |
| `issuedAtMs` | 伺服器時間 ms；過時 `clear_now` 只 ack 不清畫面 |
| `params` | 依 `type`（如 `push_numbers.ready` / `preparing`） |
| `issuedAt` | 可選；`issuedAtMs` 缺時 fallback |

後端仍寫入裝置文件 `pendingCommand`（含 `boardSeq`）。**心跳不寫 `control/pending`。**

## 前端監聽策略

1. `onSnapshot(today_board)` — 有變更即套用（停快輪詢；保留約 **60s** 保底讀一次）。
2. 指令：**先** `control/pending`；權限拒絕或文件不存在 → **改** 裝置文件 `pendingCommand`；兩者皆不可用 → **退回** 既有 `pollBoard` + `pollDevice`。
3. 裝置文件每 15s 心跳會觸發 snapshot：**同一 `id` 不可重複執行**（與現有 `shouldSkipDeviceCommand` 一致）。
4. 斷線／`online`／分頁回前景：整份重讀並以 `seq` 對齊。
5. SDK 不可用、登入失敗、規則拒絕：自動退回輪詢，UI「連線暫停／離線」行為不變。

## Emulator 規則測試

- 本 repo `tests/firestore-rules/` 使用**草稿**規則，對齊 `9940daf` 意圖；後端 `firestore.rules` 更新後改為引用後端檔案。

## 自測店別（安全）

- 寫入／送號：僅 `zz-qa-*`
- 只讀：`c030020`
- 不碰：`s120030`；不開新假店；跨店隔離用 `zz-deny-test` 或另一 `zz-qa` 店
