# POS 收件紀錄（唯讀 QA 工具）

獨立於 GitHub Pages 看板站；`deploy-pages.yml` 已排除 `tools/`。

## 本機

```bash
cd tools/pos-receive-log
npm ci
npm run mock   # 選用：mock API :3921
npm run dev    # Vite；加上 ?apiBase=http://127.0.0.1:3921
npm test
npm run build
```

API（完整 URL）：`GET posIntakeLogFeed?storeId=&limit=`（`limit` 預設 200、上限 1000；時間篩選在前端）。

回應：`{ "status": "ok", "records": [...] }` 或 `{ "status": "已停用" }`。

預設 `config.default.json` 指向 test cloud `posIntakeLogFeed`；可用 query `?apiBase=` 覆寫。

## 表格欄位（與 UI 標題一致）

1. 收件時間（Taipei）
2. 送件時間
3. 作業時間（秒）
4. 門市
5. 入口
6. 來源 IP
7. 請取餐
8. 準備中
9. 結果

展開列另含：請取餐／準備中號碼清單、拒絕送出（若有）、POS timeStmp（raw）、raw payload。詳見 `docs/pos-intake-log.md`。

## Firebase Hosting（僅 milksha-qms-dev）

```bash
npm run build
firebase deploy --only hosting:milksha-pos-receive-log-dev --project milksha-qms-dev
```

需具備該專案 Firebase CLI 權限（例如 `GOOGLE_APPLICATION_CREDENTIALS` 或 `firebase login:ci` token）。
