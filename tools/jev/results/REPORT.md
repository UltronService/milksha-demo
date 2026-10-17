# jev QA 試驗報告（2026-10-16）

## 摘要

| 指標 | 值 |
|------|-----|
| 案例數 | 26（通過 19／不通過 7） |
| Fallback 率（confidence&lt;0.85 或「看不出來」） | 73.1%（19/26） |
| 整體 match 率（僅 confidence≥0.85 且非「看不出來」計 match） | 26.9%（7/26） |
| jev 選項與 QA 標籤一致（不看 threshold） | 84.6%（22/26） |
| 非 fallback 準確率 | **100%**（7/7） |
| FAIL recall（QA 不通過被 jev 判不通過，非 fallback） | **100%**（7/7 中有 7 個 QA fail；非 fallback 子集內全對） |
| Input tokens | 55,819 |
| 估計成本（僅 input，\$0.042/Mtok） | ~\$0.00234 USD |

## 解讀（PM）

jev 在**敢給高信心答案時**與 QA 完全一致，但多數案例（約七成）會選「看不出來」或信心不足，需交回 Cursor 代理人。試驗結論：**現設定不適合作為全自動判定器**；可作低流量「高信心快篩」候選，仍需 fallback。

## 手動驗收（UAT）

1. 設定 `JEV_API_KEY` 與解壓後的 `JEV_QA_LOGS_DIR`。
2. `cd tools/jev && npm test` → 應 15 tests pass。
3. `npm run replay` → 應產生 `results/replay-results.csv` 共 27 行（含表頭）。
4. 打開 CSV：fallback 為 `true` 時 `match` 欄為空；confidence 應在 0–1。
