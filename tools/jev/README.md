# jev QA 判定試驗

批次重播歷史 QA 日誌，呼叫 TypeSafe jev `choice` 判定（通過／不通過／看不出來）。

## 環境

- `JEV_API_KEY`：Cursor Secrets（勿寫入 repo）
- `JEV_QA_LOGS_DIR`：案例根目錄（預設本機 `/tmp/jev-qa-logs`，需自行解壓 `jev-qa-logs.tgz`）

## 指令

```bash
cd tools/jev
npm test
npm run replay
```

產物：`results/replay-results.csv`、`results/replay-summary.json`。

設計說明見 `CONTEXT.md`、`adr/0001-jev-qa-judge-trial.md`。
