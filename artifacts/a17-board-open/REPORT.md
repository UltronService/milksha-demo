# a17 看板網址打不開 — 只讀調查報告

調查時間：2026-10-19（UTC）  
目標 URL：`https://ultronservice.github.io/milksha-demo/?mode=cloud&store=a17`  
安全：未對 a17 送號／清空；`boardAutoPair` 探測僅用一次性 `readonly-probe-*` deviceId 並確認回 `ok:false`；Playwright 攔截 `boxHeartbeat` / `devCommand` / `boxUpload` / `posReceiver`。

## 主管回報與調查對照（09:24 台北）

客戶手機截圖：標題「迷客夏・取餐叫號」、`ultronservice.github.io` 已載入、黑底、置中錯誤卡「**無法載入叫號看板**」＋「**找不到目標叫號機**」。  
**與本調查 Playwright 結果一致**（見 `board-a17-live-pair-allowed-no-heartbeat-1920x1080.png`）：**站點正常、頁面有開、屬錯誤狀態而非整頁掛掉**。

---

## A. 錯誤文案程式位置與觸發條件

### 固定標題「無法載入叫號看板」

| 檔案 | 函式 | 說明 |
|------|------|------|
| `js/app.js` | `showBootError(message)` | 將 `#board-root` 設為 `boot-error-stage`，**h1 固定**為「無法載入叫號看板」；**p 內文**為參數 `message`（HTML escape）。 |

**會呼叫 `showBootError` 的情況（同一張錯誤卡、不同 p 文案）：**

| 來源 | 檔案／函式 | 觸發條件（白話） |
|------|------------|------------------|
| 品牌／看板模組啟動失敗 | `js/app.js` → `boot()` 的 `.catch` | `QMS.loadSiteBrand()` 失敗、`bootMilkshaBoard` 未載入（例：`叫號看板模組未載入`）、`attachMilkshaDemo` 失敗等。 |
| 雲端自動配對失敗 | `js/board/board-auto-pair-host.js` → `showPairBootError` → `QMS.showBootError` | 見下表「找不到目標叫號機」路徑。 |

### 內文「找不到目標叫號機」（客戶截圖屬此類）

| 檔案 | 函式 | 觸發條件 |
|------|------|----------|
| `js/transport/board-bind-api.js` | `requestBoardAutoPair` | 雲端 `POST boardAutoPair` 回 **`ok: false`** → 丟錯，`err.message` = `json.information`（常為「找不到目標叫號機」），並設 `pairOkFalse: true`。 |
| `js/board/board-auto-pair-host.js` | `handlePairFailure(err)` | `runPair()` 內 `BoardBindApi.requestBoardAutoPair` 或後續 `signInWithCustomToken` 失敗時：若 `err.pairOkFalse` → `showPairBootError(err.message \|\| '找不到目標叫號機')`；否則用 `err.response.message` / `err.message`，都沒有則預設「找不到目標叫號機」。 |
| `js/board/board-auto-pair-host.js` | `showPairBootError` | 傳入空字串時仍 fallback「找不到目標叫號機」。 |

**a17 客戶畫面鏈路（`?mode=cloud&store=a17`、無本地 bind 紀錄）：**  
`cloud-boot.js` 啟動 → `AutoPairHost.startBoardAutoPair` → `POST boardAutoPair`（`brand: Milksha`, `storeNumber: a17`）→ 雲端 **`ok: false`** → `handlePairFailure` → 全頁「無法載入叫號看板」＋「找不到目標叫號機」。

**其他程式也有同句字串（非此 boot 錯誤卡）：** `validate-request.js`（POS 回傳文案）、`pos-receiver-validate.js`、`local-cloud-shim.js` 等——**客戶此 URL 不會走那些路徑**。

---

## B. `mode=cloud` 連哪個環境？a17 在哪裡找不到？

| 項目 | 證據 |
|------|------|
| GitHub Pages 內建專案 | 線上 `config/firebase.js`：`projectId: 'milksha-qms-dev'`、`region: 'asia-east1'`（與 repo `config/firebase.js` 註解「示範站 → milksha-qms-dev」一致）。 |
| `mode=cloud` 解析 | `js/transport/config-resolve.js` → `resolveConfigForMode('cloud')` 用 `CloudSettings.effective()` 合併內建 config，並以 `productionEndpoints(projectId, region)` 組出 **`https://asia-east1-milksha-qms-dev.cloudfunctions.net/`** 與 Firestore REST（**非 emulator**；Pages 主機上 `gateway` 等 dev 覆寫會被清掉，`cloud-settings.js` `isProductionPagesHost()`）。 |
| 是否 prod | 此 URL **未**指向其他 Firebase 專案；調查僅觸及 **milksha-qms-dev**（未碰 prod）。 |
| a17 | 在 **milksha-qms-dev**：`listStores` **無 a17**；`devLogin(storeId=a17)` → **403 `store_id_invalid`**；`boardAutoPair(storeNumber=a17)` → **`ok: false`「找不到目標叫號機」**（`investigation.json`）。 |

---

## C. 店號格式與應給客戶的連結

### 程式接受的 `store` 格式（`controller/store-list.js` → `isValidStoreIdFormat`）

1. **字面白名單**：`s120030`、`c030020`、`a17`（`KNOWN_LITERAL_STORE_IDS`）。  
2. **迷客夏常見六碼**：`^[a-z][0-9]{6}$`（例 **`c030020`**、**`s120030`**）。  
3. **QA 測試店**：`zz-qa-<小寫英數-段>`（例 `zz-qa-store-a`）。  
4. **拒絕測試**：`zz-deny-*`。

前端 demo 目錄 `validate-request.js` 的 `STORES` 亦列出 `a17`，但 **僅供本機／展示對照**；**雲端是否接受以 `boardAutoPair` / `devLogin` 為準**。

### 給客戶／營運的連結建議

- **URL 模板**（示範／dev 雲）：  
  `https://ultronservice.github.io/milksha-demo/?mode=cloud&store=<雲端已開通之 storeId>`  
  可選：`&device=stb-01`（預設即 `stb-01`）。

- **`store=a17` 現狀**：在 **milksha-qms-dev 未註冊** 時，**不應**當作可開看板的正式連結；會固定出現主管截圖中的錯誤卡。  
- **若要能開板**：需後端在 **目標 Firebase 專案**（此站為 **dev：`milksha-qms-dev`**）註冊該門市，且 `store` 參數使用 **雲端認得的 storeId**（多為 **一個小寫字母 + 六碼數字**，如 `c030020`）；**在後端確認 a17 對應的正式店號前，勿把 `a17` 連結給門市**。  
- **內部驗證用**（非客戶門市）：`https://ultronservice.github.io/milksha-demo/?mode=cloud&store=zz-qa-store-a`。

---

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
