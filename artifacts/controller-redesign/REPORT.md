# 控制端重設計 QA 報告

- **對照設計**：PR #92 `design-preview/control-redesign/`
- **實作分支**：`cursor/controller-redesign-caa0`
- **資產版本**：`20261016a`
- **真雲端／清空**：僅 CI 使用 URL pin `zz-qa-ci-store`；未對 `c030020` / `a17` 送實單

## 11 項驗收

| # | 項目 | 結果 | 說明 |
|---|------|------|------|
| 1 | 淺色主題；門市選擇最上方 | PASS | `tests/controller-redesign-acceptance.test.js` + e2e 版面 |
| 2 | 門市選擇僅 c030020、a17（+ URL pin） | PASS | `filterStoresForOperatorPicker` + e2e |
| 3 | 送出按鈕加大（56px） | PASS | CSS + unit test |
| 4 | 成功顯示 success bar；失敗僅錯誤、無 success | PASS | e2e success/error |
| 5 | 清空需確認；取消不清、確認才清 | PASS | e2e clear modal |
| 6 | 測試區保留、預設收合、可展開 | PASS | `#sec-test-tools` + e2e |
| 7 | 既有功能保留 | PASS | `controller-local-buttons` e2e |
| 8 | 看板程式未改 | PASS | diff 不含 `js/board/`、`receiver/` |
| 9 | 確認框顯示店名 | PASS | `clear-board-modal-store` + e2e |
| 10 | 未連線時送出禁用、頂部「未連線」 | PASS | e2e disconnected |
| 11 | 控制項 ≥48px；失敗訊息在送出區 | PASS | CSS `--tap-min` + `quick-send-error` |

## 截圖（1920 寬）

| 狀態 | 檔案 |
|------|------|
| 一般（已連線） | `state-normal-connected.png` |
| 成功條 | `state-success-bar.png` |
| 送出失敗 | `state-send-error.png` |
| 清空確認 | `state-clear-confirm-dialog.png` |
| 未連線 | `state-disconnected.png` |
| 測試區展開 | `state-test-section-open.png` |

## 手動 UAT（店員）

1. 開啟 `/controller/?mode=local`，確認最上方為門市、中間大藍「送出號碼」、下方紅框「清空看板」。
2. 未按連線時，右上角顯示「未連線」且無法送出。
3. 連線後送出一筆，出現綠色成功條；故意輸入錯誤門市號（如 `12`）應只在送出區顯示紅字錯誤。
4. 按「清空看板」→ 取消 → 看板號碼仍在；再按一次 → 確認清空 → 看板清空。
5. 展開「測試工具」，確認五個原測試區仍可操作。
