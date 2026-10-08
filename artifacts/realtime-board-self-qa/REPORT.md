# Realtime board self-QA（PR #32）

| 項目 | 值 |
|------|-----|
| **HEAD（分支）** | 合併後見 `git rev-parse HEAD`；矩陣快照 `live-matrix.json` › `branchSha` 可能為較早探針 SHA |
| **base main** | `7fb4f9c`（#25 畫布 + #33 1007 底圖／準備中最新號左上） |
| **合併** | `merge(origin/main)` @ `7fb4f9c`；衝突 PNG 採 main（#33） |

> **歷史紀錄**：下方 §2 矩陣 SHA（`7ad0949`／`6ef1359`）與部分 PNG 對照為 PR #32 自測當下快照；與現行 main 可能不一致。

## 1. Merge / 衝突

- 已合入 `origin/main`（`7fb4f9c`），保留 #33「準備中」排序：`nextPrep.sort((a,b) => b.firstSeenAt - a.firstSeenAt)`（最新號左上）。
- 合併衝突 `tests/e2e/committed-artifacts/*.png` 採 main 版本。

## 2. offline reconnect 5501（local + firestore）

- **main @ 7fb4f9c**：見 `main-5501-local-test.log`；產品層依 `storeAllowsPosBoardWrite`：**local／fake-cloud 看板模擬離線時不寫板**（非「仍寫板」）；單元測 `fake-cloud-pos.test.js` 為證。
- **#32（歷史）**：當時 shim 行為與 main 不同；現行以 `storeAllowsPosBoardWrite` 為準。e2e：`controller-actions` local + firestore 5501；`main-5501-local-baseline.spec.mjs`。

## 3. 真雲端延遲

見 `live-matrix.json` 每輪 `timeline`（`devCommandMs`、`boardSnapshotMeta`、`domAfterButtonMs`）；獨立 context；`zz-qa-store-a` 送號。

## 4. main 對照

`live-matrix.json`：`branch.*` / `main.*` chromium & firefox 各 3 輪（main 樹 `boardListen: false`）。

## 5. 讀取次數（REST/h 組成與 500 店）

**實測 5 分鐘**（`readCountsMeasured`，`zz-qa-store-a` 單看板、雲端 mode）：

| | REST GET（5m） | 換算 REST/h | onSnapshot/h | boardListen |
|--|--|--|--|--|
| **#32 分支** | 84 | **~1008** | ~12 | true |
| **main** | 400 | **~4800** | 0 | false |

**分支 ~1008 REST/h 主要來源**（`js/receiver/cloud-runtime.js` + 探針 `measureReadTraffic` 計 Firestore `GET`）：

1. **60 秒保底板 REST**：`boardListenActive` 時 `tick` 每 `FALLBACK_BOARD_POLL_MS`（60000）`pollBoard()` → `readBoard` REST（約 **60/h**）。
2. **裝置指令輪詢**：`commandMode === 'poll'` 時每 `devicePollIntervalMs`（設定常為 5000ms）`pollDevice()` → `readDevice` REST（理論上限約 **720/h**；實測受 auth／listener 降級影響）。
3. **開機 20s 快取板輪詢**：`FAST_BOARD_POLL_MS` 500ms 窗口（僅啟動期，摊平後每小時較小）。
4. **onSnapshot**：板文件 listener 推送（計入 `onSnapshotEvents`，**非** REST；上表 ~12/h）。
5. **不計入 REST**：`boxHeartbeat` / `devLogin` 走 Cloud Functions，非 Firestore GET。

**500 店 × 每月 Firestore REST（單看板／店，依實測率線性外推）**：

- **#32**：1008 × 24 × 30 ≈ **725,760**／店／月 → 500 店 ≈ **3.63×10⁸** 次／月。
- **main**：4800 × 24 × 30 ≈ **3,456,000**／店／月 → 500 店 ≈ **1.73×10⁹** 次／月。

（僅 REST GET；未含 snapshot 推送與 Functions。）

## 6. E2E 失敗歸因（修復摘要）

| 失敗 | 歸因 | 處理 |
|------|------|------|
| `qa-pr16-auth-board` reload／stale | **#32**：boot 時間被 heartbeat／Firestore 先搶占；`testDevicePollMs` 停自動 poll + gateway 寫死 8877 | boot 僅 devLogin／signIn；`FAKE_CLOUD_HTTP_DATE`；gateway 用 `location.port`；`kickDevicePoll` 單次 evaluate |
| `screenshots` cloud `receiverCloud` | **main／測試**：receiver-demo cloud 未寫入 cloud-settings | board 頁 init `milksha:cloud-settings` + `device=stb-01` |
| `controller-no-board-online` | **#32**：`posReceiver` 離線仍 `isSuccess:true` 時控制台未顯示「請先打開看板」 | `formatPosUserMessage`／`posSend` 辨識 `boxOnline:false` |
| 其餘（全量 e2e） | 見 CI run | 合併 #33 後重跑 |

## 7. Legacy / SDK

見 `SDK.md`（UA 模擬 Chrome 78，非真引擎）。

## 禁止項

雲端寫入僅 `zz-qa-store-a`；未寫 `zz-deny-test`／`s120030`／`c030020` 業務寫入。

## UAT（PM）

1. local：5501 準備中 → 斷線 → 一鍵可取餐 → 恢復 → ready 無多餘響鈴。  
2. 真雲 a 店：送新號 ≤3s 上屏（對照 `live-matrix.json`）。  
3. `?realtime=0` 行為同 main REST 輪詢。
