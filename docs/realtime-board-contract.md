# 看板即時監聽 — 前端需求清單

> **規則與 API 以 [milksha-cloud PR #18](https://github.com/UltronService/milksha-cloud/pull/18) 的 `docs/dev-api.md` 與 `firestore.rules` 為準。** 本文件只列前端依賴。

## 登入

| 項目 | 需求 |
|------|------|
| 看板 | `devLogin` body：`{ storeId, role: "device", deviceId }` |
| 回應 | **`customToken`**（claim：`storeId`、`deviceId`、`role`） |
| 後續 | `signInWithCustomToken` → **單一** Firebase compat `app` + Firestore；SDK 自動 refresh ID token；**勿**定時重叫 `devLogin`（認證失敗才重登＋退避） |

## Firestore 讀取（看板）

| 路徑 | 用途 |
|------|------|
| `stores/{storeId}/board/today_board` | `onSnapshot` 叫號名單 |
| `stores/{storeId}/devices/{deviceId}/control/pending` | `onSnapshot` 遠端指令 |

- **不**監聽 `devices/{deviceId}` 整份文件。
- `control/pending` 讀不到（權限／尚未部署）→ **僅指令** 退回 `pollDevice`；**today_board 仍監聽**。
- 禁止：讀他店、list 集合、客戶端寫入。

## `today_board` 欄位

| 欄位 | 說明 |
|------|------|
| `seq`, `updatedAt`, `tickets` | 既有套用邏輯 |
| 同號再送 | `seq` 仍 +1；當一般更新（不閃屏；鈴聲依現有 chime 規則） |

## `control/pending` 欄位

| 欄位 | 說明 |
|------|------|
| `id` | 去重、`ackCommandId` |
| `type` | 指令類型 |
| `boardSeq` | 發令時 `today_board.seq`（#30） |
| `issuedAtMs` | 過時 `clear_now` 判斷 |

`params`（例如 `slow.delayMs`、`push_numbers.ready`）僅在舊路徑 `devices/{deviceId}.pendingCommand`；`control/pending` **不含** `params`。前端若從監聽收到需 `params` 的指令且缺欄位，以一次 `pollDevice`／`readDevice` 補齊後執行（仍只 ack 一次）。

後端 ack 後刪除文件 → 監聽收到 **不存在** → 視為無指令（不重跑）。看板執行指令後 **立即** `boxHeartbeat` 帶 `ackCommandId`（沿用 `pendingAckCommandId`）。

## 前端行為摘要

1. 兩路 `onSnapshot` 共用同一 Firestore 實例；**板與 control/pending 監聽並行 attach**（不串在板首包之後）。`commandMode` 尚未 `control` 前仍 `pollDevice`。
2. 監聽成功時停快輪詢；`today_board` 保留約 **60s** REST 保底讀。
3. 斷線／回前景：`forceRefetch` + `seq` 對齊。
4. SDK／板監聽失敗 → 全退回 REST 輪詢；僅指令監聽失敗 → `pollDevice` + 板監聽。

## 規則測試

```bash
# 從本機 milksha-cloud checkout（PR #18）複製規則，勿改 cloud repo：
MILKSHA_CLOUD_ROOT=../milksha-cloud node scripts/copy-milksha-cloud-firestore-rules.mjs
npm run test:rules   # 需 Firestore emulator :8080
```

## 自測店別

寫入／送號：僅 `zz-qa-*`；只讀：`c030020`；不碰 `s120030`；不開新假店。
