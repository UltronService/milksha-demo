# PR #110 receive-log UAT（唯讀）

| 項目 | 值 |
|------|-----|
| **URL** | https://milksha-pos-receive-log-dev.web.app/ |
| **目標 commit** | `2272e47eb257b10d1cf638d51534ef741b5e2252` |
| **店別（唯讀查詢）** | `zz-qa-store-a` |
| **API（test cloud）** | `https://asia-east1-milksha-qms-dev.cloudfunctions.net/posIntakeLogFeed` |
| **驗證時間（UTC）** | 2026-10-20 |

## 結果：**PASS**

## 檢查項

1. **連線 / CORS** — 通過。無 `Failed to fetch`、無 CORS 相關 console error；`posIntakeLogFeed` 請求成功。
2. **資料載入** — 通過。篩選 `zz-qa-store-a` 後表格顯示 **2** 筆收件紀錄（非「此條件下沒有收件紀錄」）。
3. **版本 `2272e47`** — **未在頁面 UI 顯示**（程式目前無 footer/version 元件）；以後端部署對應 commit 為準。
4. **欄位** — 通過。表頭含 **送件時間**、**作業時間（秒）**，與 PR #110 規格一致。
5. **唯讀** — 頁面無送號／清除／刪除操作；驗證僅查詢與展開列。

## 截圖

| 檔案 | 說明 |
|------|------|
| `00-initial.png` | 進站後（未填店別） |
| `01-loaded.png` | 店別 `zz-qa-store-a`、資料與欄位 |
| `02-expanded-row.png` | 展開第一列（raw payload 等） |

## 未執行

- 未對 `c030020`、`s120030`、`a17`、`stb-01` 或 production 做任何操作。
