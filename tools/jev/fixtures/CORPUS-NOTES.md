# 26 案 QA log 來源（本對照 run）

- **答案鍵**：`answer-key-26.json`（來自資料集 `index.csv`／代理人報告總判定，非人工手標）。
- **log 本體**：PR #93 分支未提交 raw log；本機無 `jev-qa-logs.tgz` 上傳檔。
- **重建方式**：`index.csv` 自 PR #93 試驗代理人 transcript 還原；`case-001` 沿用同 transcript 內嵌的 `log.txt`；其餘 25 案自對應 `agent_id` 的 Cloud Agent transcript 依「對話第 N 輪」組裝 `=== QA 任務 ===` + `=== Cursor 代理人最終報告 ===`。
- **風險**：重建字串可能與原始 tarball 有細微差異；jev 分數以本次 run 為準。
