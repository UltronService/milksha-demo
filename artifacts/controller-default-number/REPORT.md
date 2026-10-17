# Controller default number — QA REPORT

- **Base branch:** `main`（PR #94 已合併）
- **Feature branch:** `cursor/controller-default-number-5dd5`
- **Asset version:** `20261017a`

## Pass / fail（A–E）

| ID | 項目 | 結果 | 備註 |
|----|------|------|------|
| A | 號碼規則與雲端 normalization 一致 | PASS | 單元 `controller-source-number` / `delivery-number-format` / `controller-default-number` |
| A5 | 送出後看板顯示 normalized（如 #6405→6405） | PASS | `validateQuickSendNumber('fp','#6405').normalized === '6405'` |
| A6 | 各來源皆有預設號且可送出 | PASS | `DEFAULT_QUICK_SEND_NUMBER` + e2e 切換來源 |
| B1 | 切換來源填入預設、不自動送出 | PASS | e2e `switching source fills default` |
| B2 | 切換後全選預設號 | PASS | e2e selectionStart/End |
| B3 | 預設號正常字色（非 placeholder） | PASS | CSS `#fld-quick-no { color: #161616 }` |
| B4 | 切換後焦點不跳到送出按鈕 | PASS | `focus()` 留在號碼欄 |
| B5 | 手改號碼切來源保留；不符規則阻擋送出 | PASS | `resolveQuickSendValueOnSourceChange` + e2e |
| B5.1 | 錯誤文字在 rule-note 槽位（窄屏同 below-field 槽） | PASS | e2e B5 + CSS `@media (max-width: 768px)` |
| B5.2 | 號碼欄紅框 | PASS | `.is-invalid` + e2e |
| B5.3 | 送出按鈕灰掉/disabled、hover 無額外 tooltip | PASS | `syncActionButtonStates` 清空 block-reason |
| C | 已在看板：顯示「此號碼已在看板上」、不重複送 | PASS | `buildQuickSendFieldPresentation` duplicate |
| D | 規則說明在號碼右側；≤768 下移 | PASS | 截圖 + e2e layout |
| E | PR #94 相關測試回歸 | PASS | `controller-redesign-acceptance` 單元+e2e |

## 截圖

- `artifacts/controller-default-number/controller-quick-send-1920.png`
- `artifacts/controller-default-number/controller-quick-send-768.png`
- `artifacts/controller-default-number/controller-quick-send-375.png`

## 手動驗收（UAT）

1. 開 `controller/?mode=local`，確認號碼右側有灰色規則說明。
2. 來源改「Uber Eats」→ 號碼變 `C7458` 且全選；不要按送出。
3. 手改為 `12` 再改來源為「門市」→ 仍為 `12`，右側紅字、紅框、送出不可按。
4. 改回合法 4 位門市號 → 紅字/紅框消失、可送出。

## PR 摘要

**What：** 切換來源自動帶入該來源預設號；規則說明移至號碼欄右側；驗證錯誤與「已在看板上」共用 rule-note 槽；號碼欄/送出按鈕 invalid 狀態。

**Why：** 操作員少打字、規則一眼可見，並與雲端號碼 normalization 一致。

**How to test：** `npm test`；`npx playwright test tests/e2e/controller-default-number.spec.mjs tests/e2e/controller-redesign-acceptance.spec.mjs`。
