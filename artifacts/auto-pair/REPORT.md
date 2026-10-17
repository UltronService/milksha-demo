# 看板自動配對（規格 1–4）自測報告

## PR

（推送後由 CI 填入 PR 連結）

分支：`cursor/board-auto-pair-a19b`

## 測試清單

| # | 項目 | 結果 |
|---|------|------|
| 1 | 僅品牌＋店號＋機台編號綁定（無 IP），號碼照常顯示 | 通過 |
| 2 | 已綁定後重新載入不再送綁定 | 通過 |
| 3 | 右下小字格式「已綁定：門市＋店號 YYYY-MM-DD HH:MM」 | 通過 |
| 4 | 台灣時間、整分鐘、無秒（含 23:59→00:00 單元測） | 通過 |
| 5 | UI 1080p／4K 版面（右下 16px、字高≥14、不蓋號碼） | 通過 |
| 6 | 重新載入後小字仍在 | 通過 |
| 7 | 新 session（模擬 APK 重啟）小字消失且不再出現 | 通過 |
| 8 | 同店兩台看板各自綁定、皆顯示號碼 | 通過 |
| 補 | 年份早於 2026 不顯示時間 | 通過（單元測） |
| 補 | 清除 storage 後再綁、雲端回第一次則小字再出現 | 通過 |

## 截圖

- `artifacts/auto-pair/screenshots/bind-hint-1080p.png`
- `artifacts/auto-pair/screenshots/bind-hint-4k.png`

## 執行方式

```bash
npm test
npx playwright test home-board-auto-pair.spec.mjs
```

## 真雲端 E2E

尚未執行（待 qms-platform `boardBind` 部署至 milksha-qms-dev 並提供 API 文件後，再以 `zz-qa-ci-store`／`zz-qa-store-a` 補一條）。

## 變更摘要

- 新增 `board-auto-pair` 模組：機台 UUID、綁定紀錄、session／local 小字生命週期、整分鐘台灣時鐘。
- 雲端邊界：`board-bind-api.js` + `cloud-api.boardBind`；fake-cloud 提供 `boardBind` mock。
- 看板啟動：`cloud-boot` 在 home cloud 模式完成登入後觸發配對與右下提示 UI。
