# 26 案 QA log（`qa-logs/`）

- **來源**：QA 提供的 `jev-qa-logs.tgz`（已解壓至 `tools/jev/qa-logs/`）。
- **提交前處理**：`node scripts/prepare-qa-logs-for-commit.mjs` — 每案刪除 1 行總判定（pattern 見 `verdict-line-patterns.json`）、`redactSensitive`、自 `meta.json` 移除 `qa_verdict` / `verdict_source`。
- **答案鍵**：`answer-key-26.json` + `qa-logs/index.csv`（**不**寫入 `log.txt`）。
- **jev 讀取**：`log.txt`；外送前仍經 `maskVerdictInLog`（見 `jev-compare-answer-key.mjs`）。
