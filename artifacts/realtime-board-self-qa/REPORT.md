# Realtime board self-QA（`cursor/realtime-board-4a4f` / PR #32）

## 1. offline reconnect 5501（已移除 skip）

| 項目 | 說明 |
|------|------|
| 測試 | `tests/e2e/controller-actions.spec.mjs` › `board \| no chime for ready while offline on reconnect` |
| 根因（local） | 模擬斷網後 fake-cloud 視機台為 offline，`posReceiver` **不寫入** today_board；離線期間「一鍵可取餐」只改控制台本機 tickets，雲端板仍停在 preparing。restore 後無 ready 可補。 |
| 根因（產品預期） | 真雲端／firestore 路徑用 `push_numbers` devCommand，**不依**機台 online 旗標更新板檔。 |
| 修正 | 測試改為 **`firestore` 模式**（非產品 bug）；並等待 `#btn-one-ready` / `#btn-restore` 可點。 |
| 斷言 | restore 後 `.rcv-ready` 顯示 5501，且 `ringCount` 不增加。 |

## 2. 真雲端矩陣（公開站設定，無金鑰進 repo／報告）

- 腳本：`scripts/realtime-board-live-matrix.mjs`
- API key：自 `https://ultronservice.github.io/milksha-demo/config/firebase.js` 解析；Playwright **後註冊** route 覆寫分支內假 key。
- 寫入店：僅 **`zz-qa-store-a`** 送號；`b–e` 只開板量測；**未跑** `zz-deny-test`。
- 結果檔：`live-matrix.json`（含 chromium／firefox 各 3 次、`boardListen`、`commandMode`、3s 送號、main 對照、30s 斷網、店隔離、legacy UA）。

### 送號延遲（就緒後按下 → 螢幕出號）

| 瀏覽器 | 三次 sendToDisplayMs | ≤3s |
|--------|----------------------|-----|
| Chromium | 821 / 38 / 38 ms（首輪較慢，後兩次） | 是 |
| Firefox | 79 / 70 / 77 ms | 是 |

`boardListen=true`（等待 listener 就緒後）；`commandMode=poll`（milksha-cloud #18 control/pending 尚未部署到 dev）。

### 30 秒斷線

- 方法：Playwright `context.setOffline(true)` 30s 後恢復（快取號碼仍顯示）。
- `offline30s.ok=true`（before／during／after 皆為同一 ready 號）。

### 店隔離

- store-a 送號後 store-b 看板 **未** 出現 a 的號碼（`isolated=true`）。

## 3. Legacy Chrome 78

見 `SDK.md`；`live-matrix.json` › `legacyChrome78`：gstatic **10.14.1** 三件套載入；阻斷 `firebase-firestore-compat.js` 後 `boardListen=false`（poll fallback）。

## 4. 讀取次數估算

| 情境 | 粗估 |
|------|------|
| **main** | REST 輪詢 board（config 約 0.5–2s）≈ **1800–7200 board reads/h／台** |
| **#32 現況** | `today_board` onSnapshot：初始 1 + 每次寫板 1；`commandMode=poll` 時 device 每 5s ≈ **+720 REST/h** |
| **#18 部署後** | `control/pending` onSnapshot，heartbeat **不再**為指令重讀 device；steady device REST ≈ **0**（僅板變更觸發 snapshot） |

## 5. 為何 diff +11461 行

| 來源 | 約略行數 |
|------|----------|
| `package-lock.json`（firebase-tools 等 devDeps） | **+9630** |
| 其餘：realtime 程式、rules 測試、e2e、腳本、artifacts 報告 | ~800 |
| **非** vendored Firebase SDK blob | — |

不必要檔：未 commit `firestore-debug.log`；`artifacts/.main-tree` 為矩陣 main 對照暫存。

## 6. CI／本機驗證

- `npx playwright test tests/e2e/controller-actions.spec.mjs`：**30 passed**（含 5501 offline reconnect）。
- `npm test`：**147** passed。
- 推送後請以 PR #32 最新 HEAD CI 為準。

## UAT（PM）

1. 開 PR 預覽或本機 `receiver-demo` firestore 模式：加單 5501 preparing → 模擬斷網 → 一鍵可取餐 → 恢復 → ready 有 5501 且無多餘響鈴。
2. 真雲 `zz-qa-store-a`：開看板至 `boardListen` 就緒 → 控制台送號 → 3 秒內出號。
3. URL `?realtime=0`：行為與 main 相同 REST 輪詢。
