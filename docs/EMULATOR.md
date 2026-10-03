# 對接 milksha-cloud 模擬器

後端 PR：https://github.com/UltronService/milksha-cloud/pull/1（分支 `cursor/milksha-qms-firebase-1653`）

## 啟動（範例）

```bash
# 終端 1：Firebase 模擬器（依 milksha-cloud README）
firebase emulators:start --only functions,firestore,auth

# 終端 2：GitHub Pages 靜態站（本 repo 根目錄）
npx serve -p 8088 .
```

## 設定對照

| 項目 | 預設值 |
|------|--------|
| projectId | `milksha-qms-dev` |
| Functions | `http://127.0.0.1:5001/milksha-qms-dev/asia-east1/` |
| Firestore REST | `http://localhost:8080/v1/projects/milksha-qms-dev/databases/(default)/documents/` |
| 控制端 accessCode | 向後端索取（勿寫入 Git） |
| POS 簽章金鑰 | 僅在控制頁本機輸入（勿寫入 Git、勿放入看板連結） |

## 網址範例

- 看板：`/receiver-demo/?mode=firestore&store=s120030&device=stb-01`（機上盒**勿**用 `?code=`；測試環境以設定連結 `#cfg=` 帶入存取碼）
- 控制端：`/controller/?mode=firestore`（連線區填 Functions / API Key 依 README）

## 看板設定連結（`#cfg=`，工程人員）

1. 控制端按「產生看板連結」會產生含 `#cfg=` 的 URL；`accessCode` 只出現在 hash 段，不進 query。
2. 看板載入後由 `CloudSettings.applyHashImport` 寫入機上盒本機設定，並以 `history.replaceState` 清掉網址列中的 `#cfg=`。
3. 測試環境將設定連結**私下**交給 Android 工程師，由 Ultron APK 遠端安裝進機上盒；**勿**把連結或 QR 放進 `docs/OWNER-TRIAL.md` 或給店長在盒上自行開啟。
4. 若設定連結外洩：在後端**輪換測試用存取碼**，並對**所有**已設定機上盒重新下發新設定連結。
5. **上線前 TODO（非測試環境）**：改為每台機上盒獨立、可撤銷的 device token，取代共用存取碼；本 repo 目前仍為共用 `accessCode` + `devLogin` 流程。

## 瀏覽器 CORS（真實 milksha-cloud）

正式 Firebase Cloud Functions 必須允許瀏覽器來源 `https://ultronservice.github.io` 呼叫 `devLogin`、`boxHeartbeat`、`devCommand` 與 Firestore REST（含 `OPTIONS` 預檢）。本 repo 假雲端 (`npm run fake-cloud`) 一律回 `Access-Control-Allow-Origin: *` 方便本機與 CI；行為與正式環境的 CORS 白名單不同，上線前請在 milksha-cloud 設定與驗證。

真實 milksha-cloud 函式名稱：`posReceiver`、`boxHeartbeat`、`boxUpload`、`devLogin`、`devCommand`。

### 本 repo 假雲端（`npm run fake-cloud`）實作範圍

| 函式 | 假雲端 |
|------|--------|
| `posReceiver` | 有（入口 A，行為見 [entry-a-pos-api.md](./entry-a-pos-api.md)） |
| `boxHeartbeat`、`devCommand`、`devLogin` | 有（營業日 03:00 台北、未知裝置 404 `device_not_found`） |
| `boxUpload` | **無**（入口 B 未在此模擬；請接真實後端） |

入口 B（`boxUpload`）契約與批次限制以 milksha-cloud 為準；本示範站**未**實作、也**未**在假雲端模擬 `posPayload` / `posRawBody` 等欄位。

## 無模擬器時

```bash
npm run fake-cloud
```

控制端 Gateway 填 `127.0.0.1:8787`（或 E2E 同源 `emulatorPrefix=__emulator`）。
