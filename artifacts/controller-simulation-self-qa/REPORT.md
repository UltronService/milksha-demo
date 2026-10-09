# 控制端「持續模擬門市」自測報告

> **PR**：[#37](https://github.com/UltronService/milksha-demo/pull/37)（`cursor/controller-store-simulation-578c` → `main`）  
> **HEAD**：`8e8d222`（分支 `cursor/controller-store-simulation-578c`）

### 開 PR 紀錄（Cursor ManagePullRequest）

兩次皆失敗，完整錯誤：

`Cannot create pull request: Validation Failed: {"resource":"Issue","code":"custom","message":"must be a collaborator"} - https://docs.github.com/rest/pulls/pulls#create-a-pull-request`

已由總監代開 **#37**。

## 規格澄清（總監 20:42 / 後續）

| 項目 | 狀態 |
|------|------|
| **無 30 分鐘自動停止** | 已移除；可一直跑至手動停止或關頁 |
| **任意店號可啟動模擬** | `simulationEligibility` 僅檢查 Firebase 專案 `milksha-qms-dev`，**不**封鎖 `c030020`／`s120030` |
| **自測寫入店** | 僅 `zz-qa-*`；未對 `c030020`、`s120030` 實跑寫入 |

### 單元測試證明

- `no 30-minute auto stop: still running after 2h fake clock` — 假時鐘跑 **2 小時**後 `state.running === true`，且無 `auto_max_duration`
- `simulation eligibility allows any store on milksha-qms-dev` — `c030020`、`s120030`、`zz-qa-store-a` 皆 `allowed: true`
- `store-simulation module has no store blocklist or max-run constants` — 掃描 `store-simulation.js`／`host.js` 不得含 `MAX_RUN_MS`、`FORBIDDEN_STORE` 等

### `rg` 稽核（模擬模組）

```text
# patterns: MAX_RUN|auto_max|FORBIDDEN_STORE|禁止啟動|30 * 60 * 1000|1800000
controller/store-simulation.js     → 無匹配
controller/store-simulation-host.js → 無匹配
```

完整說明見 `RG-SIMULATION.txt`。`controller-app.js` 內 `c030020` 僅為**預設店選項／fallback**，與模擬啟動無關。

---

## 假時鐘 30 分鐘統計（`node scripts/controller-sim-30min-stats.mjs`）

| 模式 | 進單間隔 ms（最小／中位／最大） | 跳號比例 | 畫面張數中位 | p5–p95 | 30min 模擬寫入次數 |
|------|----------------------------------|----------|--------------|--------|-------------------|
| 一般 | 10698 / 20218 / 29472 | 25.3% | 4 | 3–6 | 264 |
| 尖峰 | 2505 / 4997 / 7492 | 27.8% | 18 | 15–22 | 1073 |

## 長時間寫入估算（假時鐘 24h）

| 模式 | 約每小時寫入 | 約每天寫入 | 看板讀取估算 |
|------|-------------|-----------|--------------|
| 一般 | ~534 | ~13k | 寫入次數 × 看板台數 |
| 尖峰 | ~2,159 | ~52k | 同上 |

## 測試結果

| 項目 | 結果 |
|------|------|
| `npm test` | **178 / 178** 通過 |
| `controller-store-simulation.spec.mjs` | 2 / 2（本機連動） |
| `npm run test:e2e` 全量（本機 `full-e2e-run-2.log`） | **155 通過 / 4 失敗 / 4 略過** |
| 失敗說明 | `guest-clock` 字型（已知）；`home-board-background-tab`×2（環境）；`controller-simulation-live-cloud` 為舊版 clear 區塊問題，**單跑已 1 passed** |
| 真雲端 `controller-simulation-live-cloud.spec.mjs` | 見下方真雲端章節 |

## 真雲端 zz-qa-store-a

- 公開 Web API key：自 `https://ultronservice.github.io/milksha-demo/config/firebase.js` 讀取（**未**寫入 repo／本報告）。
- Playwright：`installLiveBranchCloudRoutes` 將 `github.io/milksha-demo/*` 改服務分支靜態檔，直連 `milksha-qms-dev`。
- 流程：一般 3min → 停止 → 靜默 60s → 尖峰 3min → 停止 → 靜默 60s → `clear_now` 清空。
- **結果**：`controller-simulation-live-cloud.spec.mjs` **1 passed**（約 8.4min）。
- 證據：`cloud-live-evidence.json`（每次 `sendCount`／`boardSeq` 變化時的台北時間與看板張數）、`cloud-normal-*-1920.png`、`cloud-peak-*-1920.png`。
- 停止後 60s：`stopChecks.normal`／`peak` 的 `sendCount` 與凍結 `tickets` 陣列皆與停止當下相同（見 JSON）。

## CI

- **PR #37 最新 CI run**：https://github.com/UltronService/milksha-demo/actions/runs/37936727718
- **分支 CI 列表**：https://github.com/UltronService/milksha-demo/actions/workflows/ci.yml?query=branch%3Acursor%2Fcontroller-store-simulation-578c

## UAT（PM）

1. 連線看板 →「持續模擬門市（一般）」→ 狀態「運行中」+ 已跑時間。
2.「停止模擬」→ 號碼保留、不再變化。
3. 可切尖峰；關閉控制端分頁即停。
