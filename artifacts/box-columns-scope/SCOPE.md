# POS 收件紀錄主表 —「盒子數」「未回報台數」TDD 測試範圍

**對象：** `tools/pos-receive-log` 主表（未展開列）。  
**流程：** 對齊專案慣例（`tools/pos-receive-log/docs/frontend-tdd-scope.md`、`artifacts/column-move/TEST-BOUNDARY.md`）：只測使用者可見行為；mock 僅在系統邊界（mock HTTP feed / `mockControl`，不 mock 欄位計算私有函式）。  
**說明：** 倉庫內目前無 `.cursor/skills/tdd/SKILL.md`，本文件依上述既有 TDD 範圍格式撰寫。

---

## 程式對照（實作前必讀）

| 項目 | 位置 |
|------|------|
| 主表欄位定義與渲染 | `ReceiveLogPage` 內 `columns`（`useMemo`）＋ `<Table columns={columns} …>`，檔案 `tools/pos-receive-log/src/receive-log-page.tsx` |
| 展開列盒子子表（非本輪主表，但資料同源） | `ExpandedRow` → `BoxReportsSubtable`，同檔；子表 `tools/pos-receive-log/src/box-reports-subtable.tsx` |
| UI 模型 | `ReceiveLogRecord.boxReports: BoardBoxReportRow[]`，`tools/pos-receive-log/src/types.ts` |
| Feed → UI | `normalizeApiRecord` 呼叫 `normalizeBoxReportsForIntakeLog`，`tools/pos-receive-log/src/normalize-api-record.ts` |
| API 列表鍵與欄位名 | 列表鍵 `boxReports`；單筆欄位 `boxId`、`ip`、`status`、`delay`（秒）、`clockSynced`、`clockOffsetMs`，`tools/pos-receive-log/src/normalize-box-reports.ts` |
| `status` 合法值 | `'reported'` \| `'not_reported'`（`BoxReportStatus`）；其他值 normalize 為 `status: null` |
| 空值顯示慣例 | 文字 `displayText` → `—`；計數 `displayCount` → `null`/`undefined` 為 `—`，數字 `0` 顯示 `0`（`tools/pos-receive-log/src/display-value.ts`；產品說明 `tools/pos-receive-log/docs/pos-intake-log.md`） |
| 現有主表欄序（文件） | 1–9 見 `tools/pos-receive-log/docs/pos-intake-log.md`「QA 頁面表格欄位」；**尚未**列入兩個新欄 |

---

## 計算規則（測試假設，待實作對齊）

- **盒子數：** `record.boxReports.length`（normalize 後陣列；缺欄／非陣列／空陣列 → 長度 `0`）。
- **未回報台數：** `boxReports` 中 `status === 'not_reported'` 的筆數（僅此字串；`reported`、`null`、未知字串 normalize 後的 `null` **不**計入）。

---

## 測試邊界

- **在邊界 mock：** `tests/setup.ts` + `mock/server.mjs` 的 feed（與 `receive-log.test.tsx`、`box-reports-expanded-row.test.tsx` 相同）。
- **不在單元測內 mock：** Ant Design `Table` 內部、normalize 函式（資料層用 feed JSON 驅動整合路徑；若拆純計算 helper，可另加 **建議** 小檔測輸入輸出，仍不 mock helper 本身）。

---

## 必填測試項目（Required）

1. **主表表頭文案：** 使用者載入成功後，主表表頭出現「盒子數」與「未回報台數」（精確字面，非同義改寫）。
2. **主表欄位順序：** 兩欄在表頭中的相對位置與前後鄰欄符合負責人定案順序（見下方待決 #1）；測試以表頭 `columnheader` 文字序列斷言（含展開欄在 Ant Design 中的位置慣例）。
3. **`boxReports` 缺省（API 無此鍵）：** 經 feed 進頁面後，該列「盒子數」為 `0`，「未回報台數」為 `0`（normalize 為 `[]`）；主表不白屏。
4. **`boxReports: []`：** 兩欄皆顯示 `0`；展開列「盒子回報」仍為「未回報」（既有行為，回歸）。
5. **全部 `reported`：** 例如 3 筆皆 `status: 'reported'` → 盒子數 `3`，未回報台數 `0`。
6. **部分 `not_reported`：** 例如 4 筆中 2 筆 `not_reported`、2 筆 `reported` → 盒子數 `4`，未回報台數 `2`。
7. **全部 `not_reported`：** N 筆皆 `not_reported` → 盒子數 `N`，未回報台數 `N`。
8. **未展開即可見：** 不點展開時，主表資料列已顯示兩欄數字（不需打開「盒子回報」子表）。
9. **多筆紀錄各自獨立：** 同一 feed 兩筆 record 不同 `boxReports`，主表兩列各自對應該列 id（避免只測單列）。
10. **時間篩選仍正確：** 調整 RangePicker 使一筆 record 落在範圍外後，畫面上僅剩範圍內那筆的盒子數／未回報台數（與 `filteredRecords` 行為一致）。

---

## 建議測試項目（Suggested）

11. **API `boxReports: null`：** normalize 視為無列表 → 兩欄 `0`（與缺省一致）；若產品要求舊資料顯示 `—`，改為待決 #2 後改寫必填。
12. **API 非陣列（如字串、物件）：** normalize 回 `[]` → 兩欄 `0`；頁面不當掉。
13. **未知 `status`（如 `"pending"`）：** normalize 後該筆 `status: null` → 計入盒子數、**不**計入未回報台數；展開子表「晚幾秒」等顯示與既有子表規則一致（回歸）。
14. **混有 `status: null` 的陣列元素：** 盒子數含該筆；未回報台數不含（除非字串為 `not_reported`）。
15. **主表排序／點欄排序（若實作 sorter）：** 點「盒子數」或「未回報台數」表頭後，資料列順序隨排序變化且數字仍正確；若本版**不**做 sorter，測試改為斷言「無排序控制」或省略。
16. **窄螢幕／橫向捲動：** 視窗寬度小於表格總寬時，兩個新表頭仍可在 DOM 中查到（與 Ant Design 橫向捲動一致），數字不與其他列錯位到錯誤行。
17. **舊紀錄顯示：** API 完全無 `boxReports` 的歷史筆與有資料筆並列時，舊筆兩欄顯示符合待決 #2（`0` 或 `—`），且與 `pos-intake-log.md` 計數慣例不矛盾。
18. **效能（500 筆）：** 與 `receive-log.test.tsx`「12. renders 500 rows without lag」同門檻：500 筆含各種 `boxReports` 組合時，主表於時限內渲染且兩欄有值（不逐筆展開）。
19. **自動更新：** 開啟自動更新後，mock feed 變更某筆 `boxReports`，主表兩欄數字跟著更新（邊界仍只 mock HTTP）。
20. **normalize 契約（資料層，可選檔案 `normalize-box-reports.test.ts` 延伸）：** 含未知 status 的陣列仍 `push` 一筆且 `status: null`，長度用於盒子數邏輯。

---

## 待負責人決策（一題一項）

| # | 問題 |
|---|------|
| **1** | 「盒子數」「未回報台數」插入主表的**確切順序**：是否為「準備中」之後、「結果」之前（即文件欄位 9、10，「結果」變 11）？ |
| **2** | API **沒有** `boxReports` 的舊紀錄：主表兩欄顯示 **`0`** 還是 **`—`**？（展開區「盒子回報」仍為「未回報」文案，與主表數字是否區分？） |
| **3** | `status` 為 **`null`**（未知 status normalize 後）：是否算在「未回報台數」？目前建議：**不算**，僅 `not_reported` 字串。 |
| **4** | 本版是否要在主表提供**可點排序**（盒子數／未回報台數）？若否，測試 15 關閉。 |
| **5** | **未回報台數為 0** 時顯示 `0` 即可，還是要用 `—` 表示「無待回報」？ |

---

## PR／規格摘要（交付開發）

| | |
|--|--|
| **What** | 主表新增「盒子數」「未回報台數」兩欄，由 `boxReports` 陣列長度與 `status === 'not_reported'` 筆數驅動。 |
| **Why** | 店長／QA 不用展開列即可掃描每筆收件的盒子覆蓋與未回報機台數。 |
| **How to test（UAT）** | 開發站收件紀錄頁 → 選有 mock／測試店資料 → 對照一筆已知 feed：數盒子子表筆數與主表「盒子數」；數子表中「晚幾秒」為「未回報」的行數與「未回報台數」；改日期範圍確認列消失後數字正確；窄視窗橫向滑動仍看得到兩個表頭。 |

---

## 手動驗收清單（UAT，非技術）

1. 打開「POS 收件紀錄（唯讀）」頁，確認表格上方篩選列正常。  
2. 在表頭找到「盒子數」「未回報台數」，位置與鄰欄順序符合產品說明。  
3. 找一筆沒有盒子資料（或全未回報）的紀錄：兩欄數字符合預期（0 或產品定的 `—`）。  
4. 找一筆有多台盒子、部分已回報的紀錄：展開看「盒子回報」，手數子表行數與「未回報」行數，與主表兩欄一致。  
5. 縮小瀏覽器寬度，橫向滑動表格，兩個新欄仍看得到且數字不跑位。
