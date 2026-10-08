# Boot-fast self-QA（PR #34：項目 1–7）

| 項目 | 值 |
|------|-----|
| **PR** | https://github.com/UltronService/milksha-demo/pull/34 |
| **HEAD** | 見本輪最後 `git push` 的 `git rev-parse HEAD` |
| **CI** | https://github.com/UltronService/milksha-demo/actions/runs/37853930510 （上一輪 `c5e72fc` 全綠；本輪 push 後請看 Actions 最新 run） |
| **對照 baseline** | `5765abf`（#32 合併點） |
| **寫入店** | `zz-qa-store-a` |

---

## 1. 開板就緒加速（REST 先顯示 + 心跳不阻塞）

| 內容 | 說明 |
|------|------|
| 改動 | `cloud-runtime`：`ensureAuth` 後立即 `kick()`（heartbeat / pollBoard / pollDevice），`startFirestoreRealtimeIfPossible()` 背景執行 |
| 去重 | `boardDocumentMarker`：`seq\|updatedAt` |
| 測試 | `npm test`；`tests/e2e/home-board-realtime-*.spec.mjs` |

## 2. `slow` 缺 `params`

| 內容 | 說明 |
|------|------|
| 改動 | 監聽路徑 `enrichRealtimeCommandFromDevicePoll` → `readDevice` 補 `pendingCommand.params` |
| 文件 | `docs/realtime-board-contract.md`（`control/pending` 僅 4 欄） |
| 測試 | `tests/firestore-realtime-pending.test.js` |

## 3. QA 低 4 項

| 子項 | 處理 |
|------|------|
| (a) realtime-board REPORT | 歷史 SHA／「仍寫板」改為 `storeAllowsPosBoardWrite` 說明 |
| (b) controller-no-board-online | 註解 shim `boxOnline`；斷言保留 |
| (c) 可取餐 timeout | `controller-no-board-online` 8s |
| (d) `syncCustomToken` | `getRealtimeStats().firebaseAuthSyncFailed` + `console.warn` 一次 |

## 4. 指令監聽並行 attach

| 指標 | 修前（#32 行為） | 修後（本分支 `live-matrix.json`） |
|------|------------------|-----------------------------------|
| `controlAfterBoardMs` | 板 `onSnapshot` 首包後才 `attachControlPending`（最長 +8s timeout） | Chromium **0–1 ms**（並行） |
| `pollDevice` 窗口 | `start()` 完成前 `commandMode=poll` | 同左；並行期間仍輪詢，不重複 ack（`shouldSkipDeviceCommand`） |
| 測試 | — | `tests/firestore-realtime-listener.test.js`「board and control listeners attach in parallel」 |

## 5. `clear_now` 無 `ackCommandId`

| 內容 | 說明 |
|------|------|
| 根因 | `handleCommand` 拋錯（如 `applyPayload`）時未送 heartbeat ack |
| 修法 | `sendHeartbeatForCommandAck` + `pollDevice`／`handleRealtimeCommand` 的 `finally` |
| 測試 | `tests/cloud-runtime-command-ack.test.js` |

## 6. 排序 tie-break（`payloadIndex`）

| 內容 | 說明 |
|------|------|
| 規則 | 主鍵仍為 `readyAt`／`firstSeenAt` DESC；**同毫秒**時用 `number_content` 內 **payloadIndex**（名單順序）DESC → 最新在左上 |
| 原因 | 同批到達共用同一 `now`；僅時間排序會變成輸入舊→新 |
| 重連 | 已存在 meta 保留原 `payloadIndex` |
| 測試 | `tests/milksha-board.test.js`（3 則）；`tests/e2e/home-board-sort-tie-break.spec.mjs` |
| 截圖 | `artifacts/boot-fast-self-qa/screenshots/tie-break-*.png` |

## 7. `data-board-online` 量測

| 內容 | 說明 |
|------|------|
| 問題 | QA 腳本若查 `#online-state[data-board-online]` 永遠等不到 |
| 修法 | **雙寫**：`controller-app.js` 同步 `data-board-online` 到 `#online-state`；腳本用 `scripts/lib/controller-board-online.mjs`（`transport-route` 或 `online-state` 任一為 `1`） |
| 腳本 | `scripts/boot-fast-self-qa.mjs`、`scripts/realtime-board-live-matrix.mjs` |

---

## 真雲端數字（`node scripts/boot-fast-self-qa.mjs` → `live-matrix.json`）

### Chromium 均值（3 輪，本輪腳本輸出）

| 指標 | 本分支 | baseline `5765abf` |
|------|--------|-------------------|
| `boardFirstPaintMs` | ~2525 | ~2820 |
| `controllerBoardOnlineMs` | ~3823 | ~3765 |
| `realtimeAttachedMs` | ~3696 | ~3707 |
| `controlListenAttachedMs` | ~3687 | （舊版無 timeline） |
| `controlAfterBoardMs` | **~0–1** | — |
| `sendToDisplayMs` | ~55 | ~60 |

### Firefox 均值

| `boardFirstPaintMs` | ~3639 |
| `controllerBoardOnlineMs` | ~4414 |

---

## 本地驗證

| 命令 | 結果（本機） |
|------|----------------|
| `npm test` | **161** pass |
| `npm run test:e2e` | 上一輪 **141 passed**（`guest-clock` 字體 1 fail，與本 PR 無關）；CI run 上表 **SUCCESS** |
| `playwright test tests/e2e/home-board-sort-tie-break.spec.mjs` | **1 passed** |

## UAT（PM）

1. 雲端 `zz-qa-store-a`：開看板 → 控制器「看板在線」；準備中最新號在左上。
2. 一次送多筆同時到：順序應 2012 在 2003 上方（準備中／可取餐各區同規則）。
3. `?realtime=0` 仍 REST 輪詢。
