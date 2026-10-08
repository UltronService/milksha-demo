# Realtime board self-QA（PR #32）

| 項目 | 值 |
|------|-----|
| **HEAD（分支）** | `git rev-parse HEAD` 見 `live-matrix.json` › `branchSha` |
| **base main** | `6ef1359`（#25 固定 16:9 畫布）見 `live-matrix.json` › `baseMainSha` |
| **合併** | `merge(main): 6ef1359` — 保留 `milksha-board-canvas` / cache-bust |

## 1. Merge / 衝突

- 已 `git merge origin/main`（非 force push），解決 `board-boot-no-data-1920.png` 採 main（#25）版本。
- 合併後重跑：`npm test`（148）、`npm run test:e2e`（見 CI / `/tmp/full-e2e.log`）。

## 2. offline reconnect 5501（local + firestore）

### main @ 6ef1359 實測（原始 local 腳本）

- 指令：`tests/e2e/main-5501-local-baseline.spec.mjs`（內容同 main 上 local 測試）。
- **在僅 main 程式樹、未修 shim 時：失敗**（15s 內 `.rcv-ready` 無 5501）。日誌：`main-5501-local-test.log`。
- **根因**：`local` 走瀏覽器內 `local-cloud-shim.posReceiver`，模擬斷網時 `storeHasOnlineBox()` 為 false → **不寫** `today_board`；與 #32 realtime 無關。
- **修復**（產品／假雲一致）：`local-cloud-shim` + `fake-cloud` 在簽章合法時**仍寫板**；`isSuccess: true`，`information` 仍可為離線文案；receiver `restore` 走 `applyBoardDocument({ force: true })` + `suppressRingOnNextApply`。
- **#32 測試**：
  - `board | no chime … (local)` — 恢復 main 行為並通過。
  - `board | no chime … (firestore)` — 第二支，覆蓋 `push_numbers` 路徑。

## 3. 真雲端延遲（可稽核）

見 `live-matrix.json` 每輪 `timeline`：

- `buttonPressedAt` / `devCommandResponseAt` / `devCommandMs`
- `boardSnapshotAt` + `boardSnapshotMeta`（`fromCache`, `hasPendingWrites`, `seq`, `updatedAt`）
- `domVisibleAt` / `domAfterButtonMs`
- **獨立 context**（看板頁與控制台分頁）；`ticketNo` 每輪不同（8800+ 系列），`displayedReadyNo` 必與之一致。

## 4. main 對照數字

`live-matrix.json`：

- `branch.chromium[]` / `branch.firefox[]` — 各 3 輪 `sendToDisplayMs` + timeline
- `main.chromium[]` / `main.firefox[]` — 同結構（main 樹無 `getRealtimeStats` / onSnapshot hook 時 `boardListen: false`）

## 5. 讀取次數

- **實測（5 分鐘）**：`readCountsMeasured.branch` / `readCountsMeasured.main` — `restGet`、`onSnapshotEvents`、`perHour`（`method: "measured"`）。
- **估算**：`readCountsEstimated`（標明 estimate only）。

## 6. Legacy / SDK

- `SDK.md`：`legacyChrome78.uaSimulatedOnly`；Firebase 官方支援表連結。
- Playwright 僅改 UA，**非**真 Chrome 78 引擎。

## 禁止項

- 僅寫入 `zz-qa-store-a` 送號；未跑 `zz-deny-test`；未動 `s120030` / `c030020` 寫入。

## UAT（PM）

1. local：5501 preparing → 模擬斷網 → 一鍵可取餐 → 恢復 → ready 無多餘響鈴。
2. 真雲 a 店：看板 `boardListen` 就緒後送新號 → 3s 內上屏（對照 `live-matrix.json` timeline）。
3. `?realtime=0` 與 main 同 REST 輪詢。
