# a17 看板網址打不開 — 只讀調查報告

調查時間：2026-10-19（UTC）  
目標 URL：`https://ultronservice.github.io/milksha-demo/?mode=cloud&store=a17`  
安全：未對 a17 送號／清空；`boardAutoPair` 探測僅用一次性 `readonly-probe-*` deviceId 並確認回 `ok:false`；Playwright 攔截 `boxHeartbeat` / `devCommand` / `boxUpload` / `posReceiver`。

## 開頁時可能觸發的伺服器寫入（程式碼）

| 順序 | 請求 | 說明 |
|------|------|------|
| 1 | `POST …/boardAutoPair` | 無 bind 紀錄時：`{ brand, storeNumber, deviceId }`（#97 自動配對） |
| 2 | `POST identitytoolkit…/signInWithCustomToken` | 配對成功後登入 |
| 3 | `POST …/devLogin` | `ensureIdToken` |
| 4 | `POST …/boxHeartbeat` | 週期性（預設 15s） |
| 5 | `POST …/devCommand` / `boxUpload` | 指令 ack、上傳 |
| 6 | Firestore listener / commit | 讀取與可能的 ack 寫入 |

另：瀏覽器 `localStorage` 會寫 `milksha:deviceId`、`milksha:board-machine-id`、成功配對後 `milksha:board-bind-record`。

## 1. 瀏覽器實際畫面與 HTTP

- **GitHub Pages**：`HEAD` 回 **200**（HTML、`css/base.css`、`js/receiver/cloud-boot.js`、`config/firebase.js` 皆 200）。
- **a17（Chromium 1920×1080，允許 `boardAutoPair`、阻擋 heartbeat 等）**：全頁錯誤卡「**無法載入叫號看板**」／「**找不到目標叫號機**」；無叫號畫布。截圖：`artifacts/a17-board-open/board-a17-live-pair-allowed-no-heartbeat-1920x1080.png`。Console：`[board-auto-pair] bind failed 找不到目標叫號機`。
- **對照 zz-qa-store-a**：正常叫號看板（`hasCanvas: true`，`receiverCloud: true`）。截圖：`artifacts/a17-board-open/board-zz-qa-store-a-live-pair-allowed-no-heartbeat-1920x1080.png`。

## 2. `store=a17` 格式與 dev 雲端是否存在

- **前端格式**：`controller/store-list.js` 的 `KNOWN_LITERAL_STORE_IDS` 含 `a17`；`js/receiver/validate-request.js` 的 `STORES` 亦有 `a17`（與 `c030020` 的 `^[a-z][0-9]{6}$` 不同，屬字面白名單）。
- **dev 雲端（milksha-qms-dev）**：
  - `listStores`（`zz-qa-store-a` controller 權限）：**無 `a17`**（`hasA17: false`）。
  - `devLogin`（`storeId=a17`, role=device）：**403**，`code: store_id_invalid`。
  - `boardAutoPair`（`brand=Milksha`, `storeNumber=a17`）：**200**，`{"ok":false,"information":"找不到目標叫號機"}`（見 `investigation.json`）。

## 3. 原因分類

| 類型 | 判定 |
|------|------|
| 網址參數錯 | 否 — `mode=cloud&store=a17` 語法正確 |
| 網站掛了 | 否 — Pages 200，zz-qa 可開 |
| 配對失敗（#97） | **是（主因）** — 雲端未登記 a17，`boardAutoPair` 回找不到叫號機 |
| 找不到門市（dev 註冊） | **是** — `listStores` 無 a17，`devLogin` 拒絕 a17 |

## 4. 「打不開」的類型

- **不是**整站白屏或 DNS 失敗；**是**頁面載入後停在 **boot 錯誤全頁**（HTTP 200 + JS 跑完後配對失敗）。

## 5. 正確網址怎麼寫

- 格式：`https://ultronservice.github.io/milksha-demo/?mode=cloud&store=<店號>`（可選 `&device=stb-01`）。
- **a17**：在 **milksha-qms-dev 尚未註冊／未允許** 前，即使用 `store=a17` 也會配對失敗；需後端將真實門市註冊為 dev 接受的 `storeId`（或改用已存在的店號，例如 QA 用 `zz-qa-store-a`）。
- 迷客夏正式六碼範例（程式內 demo，**本次未開啟**）：`store=c030020`、`store=s120030` 等。

## 證據檔

- `artifacts/a17-board-open/investigation.json`
- 截圖：`board-a17-live-pair-allowed-no-heartbeat-1920x1080.png`、`board-zz-qa-store-a-live-pair-allowed-no-heartbeat-1920x1080.png`

## PR 摘要（給開發）

- **What**：只讀調查 a17 看板 URL 無法使用。
- **Why**：營運回報打不開；需區分站點故障 vs 店號／配對問題。
- **How to test**：用無痕開 a17 URL 應見「找不到目標叫號機」；換 `store=zz-qa-store-a` 應見正常看板（勿在正式店送號）。
