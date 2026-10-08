# Boot-fast self-QA（開板加速 + 監聽並行 + clear_now ack）

| 項目 | 值 |
|------|-----|
| **HEAD** | 見本 PR 合併前最後 push 的 `git rev-parse HEAD` |
| **對照 baseline** | `5765abf`（#32 合併點，未含本 PR） |
| **寫入店** | `zz-qa-store-a` / `zz-qa-store-b`（腳本僅 a 送號） |
| **路由** | Playwright `github.io/milksha-demo/*` → 本機樹（公開 `config/firebase.js`） |

## 做了什麼

1. **開板就緒**：`cloud-runtime` 先 `kick()`（heartbeat + `pollBoard` + `pollDevice`），Firestore 即時 `start()` 不阻塞；REST 首包與 snapshot 以 `seq|updatedAt` marker 去重。
2. **指令監聽並行**：`firestore-realtime.js` 板／`control/pending` 同時 `onSnapshot`；`commandMode!==control` 期間仍 `pollDevice`。
3. **slow 缺 params**：監聽路徑 `pollDevice` 補 `devices.pendingCommand.params`；單元測 `firestore-realtime-pending.test.js`。
4. **clear_now ack**：`handleCommand` 拋錯時 `finally` 仍 `sendHeartbeatForCommandAck`；測試 `cloud-runtime-command-ack.test.js`。
5. **可觀測**：`getRealtimeStats().firebaseAuthSyncFailed`；`__rcvMatrixTimeline` 新增 `board_listen_attached` / `control_listen_attached`。

## 測試

| 類型 | 指令 |
|------|------|
| 單元 | `npm test`（含 `cloud-runtime-command-ack`、`firestore-realtime-listener` 並行用例） |
| E2E | `npm run test:e2e` |
| 真雲端矩陣 | `node scripts/boot-fast-self-qa.mjs` → `live-matrix.json` |

## 對照數字（`live-matrix.json` 快照）

### Chromium（3 輪均值約）

| 指標 | 本分支 | baseline `5765abf` |
|------|--------|---------------------|
| `boardFirstPaintMs` | ~2525 | ~2820 |
| `controllerBoardOnlineMs`（`data-board-online=1`） | ~3823 | ~3765 |
| `realtimeAttachedMs` | ~3696 | ~3707 |
| `controlListenAttachedMs` | ~3687 | （舊版無 timeline） |
| `controlAfterBoardMs`（並行後板→指令首包） | **~0–1** | （舊版串行：指令 attach 起點在板首包之後，最長 +`LISTENER_ATTACH_TIMEOUT_MS` 8s） |
| 送號→上屏 `sendToDisplayMs` | ~55 | ~60 |

### Firefox（3 輪均值約）

| 指標 | 本分支 | baseline |
|------|--------|----------|
| `boardFirstPaintMs` | ~3639 | — |
| `controllerBoardOnlineMs` | ~4414 | — |
| `controlAfterBoardMs` | **~0–1** | — |

> **#4 結論**：並行後 `control_listen_attached` 與 `board_listen_attached` 同毫秒級；舊版程式在 `attachBoardListener` 完成後才開始 `attachControlPendingListener`，實測曾出現板已 listen 但指令首包接近 8s 才到的情況。並行期間 `commandMode=poll` 的 `pollDevice` 仍接住指令。

> **#5 結論**：`clear_now` 若 `applyPayload` 拋錯會跳過 ack heartbeat；已改 `finally` 補 ack。若看板已因 `today_board` snapshot 清空但 pending 未 ack，需依賴 `pollDevice`／修復後的 listener ack 路徑。

## CI

合併前請填：`gh run list` 本 PR 最新 workflow run URL。

## UAT（PM）

1. 開 `?mode=cloud&store=zz-qa-store-a` 看板 → 2–3 秒內應出現號碼或時鐘；控制器約 3–4 秒內顯示看板在線。
2. 送一個新號 → 3 秒內上屏。
3. `?realtime=0` 仍僅 REST 輪詢。
4. 控制器發 `clear_now` → 看板清空後 15 秒內心跳應帶 `ackCommandId`（開發者工具 Network → boxHeartbeat）。
