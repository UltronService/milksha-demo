# jev QA 判定試驗（tools/jev）

## 目的

用 TypeSafe **jev**（`POST https://api.typesafe.ai/v1/systemone`，`choice` 題型）對歷史 QA 日誌做三選一判定（通過／不通過／看不出來），與人工 QA `meta.json` 標籤對照，量測是否可作為自動判定層。

## 邊界

- **輸入**：`log.txt`（任務＋代理人報告）＋ `meta.json` 的 `qa_verdict`（不送給 jev）。
- **外送前**：遮罩報告區總判定行；`redact-sensitive` 再掃一次 token／email（日誌已含 `<REDACTED>`，仍防漏）。
- **判定規則**：`confidence >= 0.85` 且 choice ≠ `看不出來` 才採信 jev；否則標 **fallback**（試驗中不呼叫 Cursor，僅記錄）。
- **金鑰**：`JEV_API_KEY`（Cursor Secrets），程式與產物不得出現明文。

## 模組

| 模組 | 職責 |
|------|------|
| `lib/mask-verdict.mjs` | 切分 `=== Cursor 代理人最終報告 ===` 後遮罩判定行 |
| `lib/redact-sensitive.mjs` | email、Bearer、長 hex、常見 secret 字樣 |
| `lib/jev-client.mjs` | HTTP 客戶端、429/529 退避 |
| `lib/evaluate-verdict.mjs` | threshold、fallback、與 QA 標籤比對 |
| `scripts/replay-qa-logs.mjs` | 批次重播、產出 CSV／摘要 JSON |

## 非目標

- 不取代 Cursor QA 代理人執行驗收。
- 不把原始 log 提交進 repo（僅結果表）。
