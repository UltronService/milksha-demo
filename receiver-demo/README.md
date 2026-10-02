# 叫號機接收端 Demo（假資料）

本目錄為**自包含**展示頁，模擬《叫號機接收端 API 串接規格》的接收端行為：依 `number_content` 整批更新「準備中／可取餐」畫面，並在展示模式下回傳規格格式的假 Response。**不連 Firebase、不呼叫外部 API**，僅載入 `../assets/logo.svg`。

## 網址

| 模式 | URL |
|------|-----|
| 一般看板 | `https://ultronservice.github.io/milksha-demo/receiver-demo/` |
| 展示控制面板 | `?demo=1` |
| 指定門市 | `?store=s120030`（可與 `demo=1` 併用） |
| 雲端同步（local） | `?mode=local&store=s120030` — 與 `/controller/` 同瀏覽器測試 |
| 雲端同步（firestore） | `?mode=firestore&gateway=…&device=stb-01&code=…` — REST 讀 `today_board`（Bearer），寫入經雲端函式 |

看板雲端文件格式見 `controller/README.md`（`today_board.tickets[]`）。

## 門市與 `target` 對照（假資料）

規格中 **`serviceSpecialData_Json.target`** 為目標叫號機識別值；接收端應只接受與本機綁定門市相符的 `target`。本 Demo 採與主看板劇本相同的慣例：**`target = merchant_id + account`（字串直接相接）**。

| store 參數 (`?store=`) | 門市名稱 | `account` | `merchant_id` | `target`（須與 Request 一致） |
|------------------------|----------|-----------|---------------|----------------------------------|
| `s120030`（預設） | 迷客夏臺南東安店 | `s120030` | `milksha` | `milkshas120030` |
| `s110012` | 迷客夏台北忠孝店 | `s110012` | `milksha` | `milkshas110012` |
| `s210008` | 迷客夏高雄三多店 | `s210008` | `milksha` | `milkshas210008` |

頁首顯示門市名稱；規格 Request **沒有門市名稱欄位**，名稱僅來自上表。

## Request／Response（展示面板）

- Textarea 預填規格 §3 的 Request 範例（COMPOSE 範例）；若要在此 Demo 門市成功顯示，請將 `target` 改為上表對應值（例如 `milkshas120030`）。
- **Send**：解析 JSON → 驗證 → 更新畫面或回傳錯誤訊息。
- **結帳→準備中**：新增一筆假單號（門市現場 `_Preparing`）並推送完整 `number_content`。
- **完成→可取餐**：將目前最舊一筆準備中改為 `_OK` 並推送。
- **03:00 清空**：推送 `number_content: []`。
- **模擬斷線**：後續推送回傳「目標叫號機尚未連線」，畫面維持上一狀態。

內層結果訊息僅使用規格建議四句：資料顯示成功／目標叫號機尚未連線／找不到目標叫號機／叫號資料格式錯誤。

## `source_type`（10 種）

`From_Store_`、`From_milksha_point_`、`From_FoodPanda_`、`From_UberEat_`、`From_Udd_` × `_Preparing` / `_OK`。

## 本地驗證

```bash
npm test
node receiver-demo/capture-screenshots.mjs
```

截圖輸出至 `/opt/cursor/artifacts/`（需 Playwright 與 `fonts-noto-cjk`）。
