# POS 收件紀錄頁 — 前端 TDD 測試範圍（核准版）

對象：`tools/pos-receive-log` 展開列「訊息摘要」與「POS 原始訊息」。  
標記：**［新］** 本輪新增；**［修］** 因負責人 4 件核准而調整。

---

## 完整清單（編號｜一句一事）

### 展開與基本行為

1. 未展開列時，畫面上不出現「POS 原始訊息」全文區（`raw-payload` 或等效 testid）。
2. 使用者點展開後，同一列可看到「訊息摘要」與（有資料時）「POS 原始訊息」等展開內容，請取餐／準備中／拒絕送出等既有區塊仍正常顯示。
3. API 回傳壞掉的 JSON 字串或空 `rawPayload` 的紀錄，仍可點展開，頁面不白屏、不當掉。

### 訊息摘要（無全文 rawPayload 的舊紀錄）［修］

4. **［修］** 舊紀錄 API 沒有 `rawPayload`（或無全文）時，展開後仍顯示標題「訊息摘要」，內容包含請求大小（如 `bodyByteSize`）與處理結果（如 `httpStatus`、`disposition`／結果標籤對應資訊、拒絕原因等產品定義欄位）。
5. **［修］** 舊紀錄無全文時，「訊息摘要」區塊標題必為「訊息摘要」，不得使用「raw payload」等易誤解為全文的文案。
6. 有全文 `rawPayload` 時，「訊息摘要」與「POS 原始訊息」為兩個分開區塊，摘要標題仍為「訊息摘要」。

### POS 原始訊息（全文區）［修］

7. **［修］** 當 API 提供非空 `rawPayload` 時，全文區標題固定為「POS 原始訊息」（不得為「raw payload」）。
8. **［修］** 「POS 原始訊息」內容區最大高度為 **320px**，超過時只在該區內垂直捲動，不撐破表格外層版面。
9. 內容未超過 320px 時，全文區不應出現不必要的雙捲軸或整頁被該列撐高。
10. `rawPayload` 顯示使用等寬字體（monospace）。
11. `rawPayload` 為可解析的 JSON 字串時，畫面以縮排排版顯示；非 JSON 則照 API 原文逐字顯示。
12. `rawPayload` 為壞掉 JSON 時，照原文顯示，不強制排版、不替換成錯誤頁。

### 無內容與截斷 ［修］

13. **［修］** `rawPayload` 缺省、null 或空字串且 `rawPayloadTruncated` 為 false 時，「POS 原始訊息」區顯示「無原始內容」，不顯示「內容過長，已截斷」。
14. **［修］** `rawPayloadTruncated` 為 true 且內容為空時，「POS 原始訊息」區先顯示「無原始內容」，其正下方再顯示「內容過長，已截斷」。
15. `rawPayloadTruncated` 為 true 且有非空內容時，先顯示全文（含排版規則），內容下方顯示「內容過長，已截斷」。
16. `rawPayloadTruncated` 為 false 時，不顯示「內容過長，已截斷」（舊文案「（已截斷）」不再使用）。

### `<REDACTED>` 與純文字安全（QA）

17. `rawPayload` 內的字面量 `<REDACTED>` 照原樣顯示，前端不解析、不還原成密文或替換成其他字。
18. `rawPayload` 含 `<script>…</script>` 時，畫面上是純文字，不執行腳本、不跳出 alert。
19. `rawPayload` 含 `<img … onerror=…>` 時，當純文字顯示，不觸發 onerror。
20. 未展開列時，頁面 HTML 不含測試用惡意 payload 的可執行節點（全文僅在展開後渲染）。

### 編碼與截斷顯示

21. 截斷後的 `rawPayload` 含中文時，展開顯示與 API 字串一致，不出現亂碼。
22. 截斷後的 `rawPayload` 含表情符號時，展開顯示完整字形，不出現破碎 surrogate 或問號替代。

### 資料層（normalize）

23. API 有非空字串 `rawPayload` 時，`normalizeApiRecord` 直接使用該字串，不以 `bodyByteSize` 合成 JSON 覆蓋全文。
24. 無 `rawPayload` 時，normalize 仍保留供「訊息摘要」用的欄位（大小、處理結果等），供 UI 顯示摘要。
25. `rawPayloadTruncated` 正確映射到 UI model（布林）。

### 效能（STB）

26. 表格載入約 500 筆紀錄仍符合既有效能門檻；僅展開一筆且 `rawPayload` 很大時，在時限內完成且捲動限制在 320px 全文區內。
27. 未展開的列不把超大 `rawPayload` 字串渲染進 DOM（lazy／展開才 mount）。

### 後端已遮蔽內容

28. Feed 回傳已遮蔽 JSON（含 `<REDACTED>`、不含明文簽章）時，展開後可見業務欄位與占位，符合後端契約（與 `normalize-api-record` 既有測試精神一致）。

### 選配：httpMethod／headers（若本版 API 有給）

29. 有 `httpMethod` 或白名單 `headers` 時，在「POS 原始訊息」上方以純文字顯示；兩者皆無則不顯示該區。
30. header 值含 HTML 標籤時，同純文字規則，不執行。

### 建議（可選測試，產品點頭後啟用）

31. `rawPayload` 內出現疑似未遮蔽的長 hex 簽章時，仍純文字顯示、前端不二次遮蔽；可選顯示一行「可能未遮蔽」警告且不改寫內容。

---

## 負責人核准（已關閉，寫入測試）

| # | 決議 |
|---|------|
| 1 | 無全文時「訊息摘要」照常顯示大小與處理結果 → 條目 4、5、24 |
| 2 | 全文區標題「POS 原始訊息」 → 條目 7 |
| 3 | 全文區 max-height 320px、區內捲動 → 條目 8、9 |
| 4 | 截斷且內容為空：先「無原始內容」、下「內容過長，已截斷」 → 條目 14、15、16 |

## 後端對齊欄位

`rawPayload`、`rawPayloadTruncated`；摘要用 `bodyByteSize`、`httpStatus`、`disposition`、`rejectReason` 等；選配 `httpMethod`、`headers`。
