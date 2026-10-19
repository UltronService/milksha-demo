# limit-500 — 交付報告

## Item 17 / 記憶體（Owner 必讀 — 本輪**未改**看板渲染）

| 問題 | 結論 |
|------|------|
| DOM 是否建立 500 個號碼格？ | **否。** `renderZoneHtml` / `patchZonePage` 只迴圈 **`PAGE_SIZE`（10）** 次建立 `milksha-num-cell`（與 `main` 相同）。500 筆只存在於 **JS 狀態** `readyItems` / `prepItems`（供分頁），不會變成 500 個 chip DOM。 |
| 全板 DOM 節點數 | 準備中 + 請取餐兩區各 10 格 → 實測 **20** 個 `.milksha-num-cell`（其中一區可為空槽）。Item 17 單元測只數 **ready 區 10 格**。 |
| 是否保留舊 payload？ | **否。** `applyPayload` 每次以 `metaById = nextMeta` 覆寫；不保留歷史 `numberContent` 陣列。單次套用後僅留當前最多 500 筆 ticket 模型（約 **24 KB** JSON 量級／500 個 4 位號；非 ~611 KB 累積）。 |
| Item 19 heap（本機 Chromium） | 套用 500 筆後 **100 次翻頁**：`usedJSHeapSize` **9.54 MB → 9.54 MB**，**增長 0 MB**（≤10 MB 門檻）。 |

**結論：** 不需為 item 17 改渲染；若未來要「虛擬化」500 筆 **in-memory 模型**，才需 owner 另案核准。

---

- **PR:** https://github.com/UltronService/milksha-demo/pull/107
- **資產版本:** `20261019d`
- **Backend:** milksha-cloud PR #38（mock）

## 雲端行為（fake-cloud）

| 規則 | 實作 |
|------|------|
| >500 號 | 不拒收；保留送出順序**最後 500** |
| push_numbers params >256 KB | `400` + `push_numbers_params_too_large` |
| 其他 devCommand >1024 B | `400` + `invalid_command_params` |
| Controller | 不做 size 檢查 |

## Controller UI（`push_numbers_params_too_large`）

- 文案：**「送出失敗：號碼太多或太長。請分批送出。」**（`#quick-send-error` 紅字，無 error code）
- 輸入框內容保留（item 11b）

## 其他雲端 oversized（非 push_numbers）

- `invalid_command_params`（1024）→「指令內容不符合規定，雲端拒收。」

## 測試

| 指標 | 數值 |
|------|------|
| `npm test` | **358** pass |
| `limit-500.test.js` | 21 cases |
| E2E item 18–19 | `limit-500-board-perf.spec.mjs` |

## 手動 UAT

1. 501 筆 → 成功 + trim。  
2. 超大 push →「送出失敗：號碼太多或太長。請分批送出。」，欄位保留。  
3. 500 筆看板僅當頁 10 格可見（開發者工具 Elements）。
