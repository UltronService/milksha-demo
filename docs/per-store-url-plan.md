# 每店專屬看板網址（milksha-qms-dev）— 已定案

## 五句摘要

1. 根看板 `/` 用 `?store=`（店號＝ API `account`）；不改成路徑，配合 GitHub Pages。
2. 無 `store` 時預設 **`c030020`**；`?store=s120030` 仍可用。舊書籤開 `/` 不得顯示 s120030 快取號碼。
3. 同店看板共用 **`stb-01`**；可選 `device` 參數仍接受。
4. 雲端 **403 store_not_allowed**：號碼保留，角落小字「**連線暫停**」；真斷網仍顯示「**離線**」（PR #23）；登入退避不迴圈。
5. 控制端 QR／連結指向 **根看板** `/?store=`；店單加 `c030020`，本次不與雲端白名單同步。

---

## 負責人決策（實作依據）

| 項目 | 決策 |
|------|------|
| 看板頁 | 根目錄 `/`（非 receiver-demo） |
| 預設店 | 無參數 → `c030020` |
| 裝置 | 全店 `stb-01`，URL 可不帶 device |
| 403 | 「連線暫停」、保留號碼、無離線徽章 |
| 控制端店單 | 既有機制 + `c030020` |
| ekanban-admin | **不在本次**（見下方 follow-up） |

---

## 各端變更（白話）

### 看板

- 以 URL `store` 決定店號；雲端 listener、心跳、localStorage 快取皆按店隔離。
- 換店或無參數開 `/` 時，不讀其他店的 `receiver-cache` 或舊 `poc-target`。

### 控制端

- 產生連結／QR：`https://…/milksha-demo/?store=<店號>&mode=cloud`（device 預設 stb-01 可省略）。

### 假雲端（本 repo）

- `devLogin` 白名單加入 `c030020`（與 `s120030`、`zz-qa-*`）。

### 正式雲端（milksha-cloud，另 repo）

- **已部署** `7a970d1`：`devLogin`／`devCommand` 允許 `c030020`（`s120030`、`zz-qa-*` 不變）。
- 看板 `/` 預設店應正常連線；未白名單店（例 `s999999`）仍為 403 →「連線暫停」。
- **Live 寫入**僅用 `zz-qa-*`；勿對 `c030020`／`s120030` 送 `push_numbers`／`clear_now`。

---

## Follow-up（未實作）

- **ekanban-admin**（ekanban-admin.vercel.app / .netlify.app，UAT：ekanban-admin-uat.vercel.app）整合。
- Milksha `target`（例：`composec030020`）日後可能對應 device 映射。

---

## 驗收（UAT 摘要）

1. 兩店分開開看板，A 店送號只出現在 A。
2. 無參數為 c030020；`?store=s120030` 仍可用；舊 s120030 localStorage 開 `/` 不出現舊號。
3. 403 → 連線暫停、號碼在、無離線、登入次數有上限。
4. PR #23 斷線／恢復／背景／時鐘跳躍仍通過。
5. 控制端連結為 home `?store=`；10 送 10 號。

---

## 程式位置（簡表）

| 主題 | 位置 |
|------|------|
| 預設店／URL 解析 | `js/receiver/cloud-boot.js` |
| 本機 POC 預設 | `js/transport/local-poc-coord.js` |
| 店清單 | `js/receiver/validate-request.js` |
| 403／離線 UI | `js/receiver/cloud-runtime.js`、`js/milksha-board.js` |
| 控制端 QR | `controller/controller-app.js` |
| 假雲端白名單 | `tools/fake-cloud/server.mjs` |
