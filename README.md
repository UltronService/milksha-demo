# 迷客夏取餐叫號看板（展示站）

靜態網站，供門市 STB／大螢幕展示 **迷客夏** 雙區叫號：左（或上）**可取餐**、右（或下）**準備中**。資料來源標籤（現場／迷點／熊貓／Uber／UDD）、分區獨立 6 秒換頁、新可取餐全螢幕提示與提示音（每批最多 3 響）等行為與內部規格一致。

## 文件頁（GitHub Pages）

| 頁面 | 網址 |
|------|------|
| API 討論規格 | https://ultronservice.github.io/milksha-demo/spec/ |
| 迷客夏簽認確認書 | https://ultronservice.github.io/milksha-demo/confirm/ |
| APK 修改規格 v0.3（外包） | https://ultronservice.github.io/milksha-demo/vendor-spec/ |
| 要問達鈦的問題 | https://ultronservice.github.io/milksha-demo/datai-questions/ |
| 接收端展示 | https://ultronservice.github.io/milksha-demo/receiver-demo/ |

## 正式網址

<https://ultronservice.github.io/milksha-demo/>

## 使用方式

| 網址參數 | 說明 |
|----------|------|
| （無參數） | 純看板，無任何控制列 |
| `?demo=1` | 顯示右下角「展示」抽屜：模擬推送、自動播放（5／8／10 秒）、手動加號、清空、靜音、重置劇本、橫／直版切換；快捷鍵 `D` 開關面板、`空白` 下一步、`A` 自動播放 |
| `?orientation=landscape` | 強制橫式 1920×1080 版型 |
| `?orientation=portrait` | 強制直式 1080×1920 版型 |
| 未指定 orientation | 依瀏覽器視窗寬高自動選橫／直 |

範例：

- 現場看板：<https://ultronservice.github.io/milksha-demo/>
- 展示／驗收：<https://ultronservice.github.io/milksha-demo/?demo=1>
- 直式預覽：<https://ultronservice.github.io/milksha-demo/?demo=1&orientation=portrait>

## 本機預覽

```bash
npx --yes serve -l 4173 .
# 開啟 http://localhost:4173/?demo=1
```

## 雲端模式（正式測試環境）

控制端與機上盒看板可透過 Firebase 專案 `milksha-qms-dev`（asia-east1）同步。**請勿**把 API Key 或存取碼寫進 Git；在控制端 **進階設定 → 雲端設定** 填寫並存於瀏覽器本機。

| 角色 | 說明 |
|------|------|
| 控制端 | `/controller/` → 連線方式選 **雲端模式** → 填雲端設定與存取碼 → 連線 |
| 看板（簡易網址） | `/receiver-demo/?store=s120030&mode=cloud` |
| 看板（首次設定） | 控制端按 **產生看板連結**，機上盒掃 QR 或開設定連結 |

店長試用步驟見 [docs/OWNER-TRIAL.md](docs/OWNER-TRIAL.md)。  
工程本機測試仍用 **本機連動** 或 **本機模擬雲端** + `npm run fake-cloud`（見 [docs/EMULATOR.md](docs/EMULATOR.md)）。

### 機上盒認證（401）

- **401**：`devLogin` 會再試一次；若仍失敗或 **refresh token 收到 401**，一般雲端輪詢（看板／裝置／heartbeat）會停止，並標記 `data-auth-stopped`。
- 之後每 **10 分鐘**自動再試登入。
- **僅本機／fake gateway**（`localhost`、`127.0.0.1` 等）可用工程用 URL 參數：`?testAuthRecheckMs=`（縮短重登間隔）、`?testDevicePollMs=`（停用自動裝置輪詢並開啟測試 hook）。正式網域上這些參數**不生效**。
- **停止期間不會收到遠端 reload 指令**；重新登入成功後恢復輪詢，才會處理遠端 `reload`。
- **遠端 reload／reboot**（兩道防護，避免雲端長期保留 `pendingCommand` 造成重複重整）：
  1. **開機伺服器時間**：本輪開機完成 `devLogin`／`signIn` 時，取回應 HTTP `Date` 標頭（`bootServerTime`，非裝置時鐘）。`reload`／`reboot` 若伺服器 `createdAt`（含 `issuedAt`）落在**同一秒或更早**則略過（比較前皆取整到秒）。若沒有 `Date` 標頭，僅靠下一項。
  2. **已執行指令 id**：執行前將 `cmd.id` 寫入 `localStorage`（`milksha:lastHandledCmd:<store>:<device>`），相同 id 不再執行。執行前仍會盡快送 heartbeat ack（短逾時），但不依賴 ack 清除雲端文件。
- **403**：不重試，維持停止直到使用者修正存取碼／權限。

### 叫號提示音佇列

- FIFO，僅在號碼離開「可取餐」時從佇列移除；**不會**因佇列長度而靜默丟棄最舊項目（僅保留極大的安全上限以防記憶體異常）。

## 測試

```bash
npm test
npm run test:e2e
```

## 目錄摘要

- `index.html` — 看板入口
- `brand.json` — 品牌與版型設定
- `js/` — 看板、音效、展示控制
- `demo/milksha-demo-script.json` — 展示用逐步劇本
- `docs/milksha-callboard/` — 規格與線框說明

## 部署

推送到 `main` 時，GitHub Actions workflow `.github/workflows/deploy-pages.yml` 會將整站靜態檔部署至 GitHub Pages。
