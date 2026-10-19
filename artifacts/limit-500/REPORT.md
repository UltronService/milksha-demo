# limit-500 — 交付報告

- **PR:** https://github.com/UltronService/milksha-demo/pull/107
- **分支:** `cursor/limit-500-numbers-7037`
- **資產版本:** `20261019c`
- **Backend 對齊:** milksha-cloud **PR #38**（read-only；mock 行為依 owner 規格實作）

## 雲端行為（fake-cloud / PR #38）

| 規則 | 實作 |
|------|------|
| >500 號碼 | **不拒收**；`trimTicketsToBoardCap` 保留**送出順序中最後 500 筆**（ready[] 再 preparing[]） |
| push_numbers params > **256 KB** | HTTP **400**，`push_numbers_params_too_large` |
| 其他 devCommand body > **1024 B** | HTTP **400**，`invalid_command_params`（message 含 byte limit 提示） |
| Controller | **不做**任何 size 檢查（devCommand 無 1024／256K 客戶端上限） |
| boxHeartbeat | 客戶端 1024 檢查保留 |

## Controller 錯誤文案

| Cloud code | 使用者文案 |
|------------|------------|
| `push_numbers_params_too_large` | 送出內容太大，雲端拒收。請減少號碼或縮短號碼後再送。 |
| `invalid_command_params`（雲端 oversized 訊息） | 指令內容不符合規定，雲端拒收。 |
| 其他 `invalid_command_params` | 仍為「指令內容不正確…」（本機驗證等） |

模組：`tools/fake-cloud/cloud-dev-command-size.mjs`、`js/transport/controller-command-errors.js`

## 19 項驗收對照

| # | 測試 |
|---|------|
| 1–8, 10–19 | `tests/limit-500.test.js` + `tests/e2e/limit-500-board-perf.spec.mjs` |
| 9 | item 9 + item 9b（501 trim、跨 ready/preparing 最後 500） |
| 11 | item 11（其他錯誤）+ item 11b（256KB 拒收後輸入保留） |
| PR38 256KB | `limit-500 cloud PR38: push_numbers over 256KB…` |
| PR38 1024 非 push | `limit-500 cloud PR38: non-push devCommand over 1024…` |

## 單元測試

| 指標 | 數值 |
|------|------|
| 全 suite | **358** pass（`npm test`） |
| limit-500 檔 | **21** cases |

## 與 #95

可能衝突；#95 合併後 rebase。

## 手動 UAT

1. 501 筆送號 → 成功，最舊消失、新號出現。  
2. 刻意塞爆 256KB params → 上述「送出內容太大」文案，輸入框保留。  
3. 非 push 超大 body（僅雲端）→「指令內容不符合規定，雲端拒收。」
