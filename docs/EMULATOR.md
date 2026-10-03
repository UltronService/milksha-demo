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

- 看板：`/receiver-demo/?mode=firestore&store=s120030&device=stb-01&code=dev-controller-access-2026`
- 控制端：`/controller/?mode=firestore`（連線區填 Functions / API Key 依 README）

函式名稱：`posReceiver`、`boxHeartbeat`、`boxUpload`、`devLogin`、`devCommand`。

## 無模擬器時

```bash
npm run fake-cloud
```

控制端 Gateway 填 `127.0.0.1:8787`（或 E2E 同源 `emulatorPrefix=__emulator`）。
