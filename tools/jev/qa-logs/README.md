# jev QA 對照資料集（叫號機）

1. 範圍：叫號機 milksha-demo、milksha-cloud 的 QA 驗收，約 2026-10-03 到 10-16。
2. 每個案例一個資料夾 case-NNN/。
3. log.txt：QA 任務說明，加上 Cursor 代理人的最終報告。判定依據就是這份報告。
4. meta.json：案例編號、專案、PR、commit、台北日期、qa_verdict（通過／不通過）、判定來源、代理人 ID。
5. index.csv：所有案例的清單。
6. 判定來自 QA 紀錄，也就是驗收代理人最終報告的總判定。只收判定明確的案例。
7. 機密都已改成 <REDACTED>。date_taipei 是空值時，表示查不到日期。
8. 注意：log.txt 已含判定字樣（PASS／FAIL）。測 jev 前，後端可以考慮把總判定那一行遮掉。
