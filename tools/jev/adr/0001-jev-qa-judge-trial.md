# ADR 0001：jev 作為 QA 三選一判定器（試驗）

## 狀態

Accepted（試驗分支 `cursor/jev-qa-judge-trial-fc38`）

## 背景

QA 驗收代理人產出長報告與明確 PASS/FAIL。需在不把總判定洩漏給外部模型的前提下，試用 jev 是否可從報告內容推斷與人工一致的結論。

## 決策

1. 使用 **choice** primitive，選項鍵為 `通過`｜`不通過`｜`看不出來`（與 API `criteria` 鍵一致）。
2. `state` 為遮罩＋ redaction 後的整份 `log.txt` 字串；`model`: `jev-latest`。
3. 採信門檻 **0.85**；低於或選 `看不出來` → fallback（試驗僅標記）。
4. 外送資料至美國 TypeSafe 端點；遮罩＋ redaction 為必要防線，非完整 DLP。

## 後果

- 可量測準確率、FAIL recall、fallback 率與 token 成本。
- 準確率不足時仍以 Cursor 代理人為準；jev 僅作輔助判定候選。
