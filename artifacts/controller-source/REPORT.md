# 控制端「選來源送號」REPORT

- **分支：** `cursor/controller-source-667f`
- **資產版本：** `20261013b`
- **真雲端店：** 僅 `zz-qa-ci-store`（本次 #7 僅單元測試 mock，未跑 live cloud）

## 紅→綠（TDD）

| # | 項目 | 紅（先寫測） | 綠（實作後） |
|---|------|-------------|-------------|
| 1 | 來源選單五項、預設門市 | `node --test tests/controller-source-number.test.js` 缺模組 FAIL | `tests/controller-source-number.test.js` 第一則 PASS |
| 2 | 門市 4 位 | 同上 store case FAIL | PASS |
| 3 | 迷點 3–4 位、前導 0 | point `091` FAIL | PASS |
| 4 | Uber／Udd 4–6 英數大寫 | `c7458` FAIL | PASS |
| 5 | foodpanda 4–6 位、去 `#` | `#6406` FAIL | PASS |
| 6 | 不符不送、紅字 | e2e 無 `#quick-send-error` FAIL | `controller-source-quick-send.spec.mjs` invalid case PASS |
| 7 | 雲端 push_numbers `{ no, sourceType }` | devCommand 只收字串 FAIL | `controller-source-number.test.js` + `dev-command-validation.test.js` push_numbers case PASS |
| 8 | 本機兩格（1234 門市 + 1234 Uber） | e2e count≠2 FAIL | `controller-source-quick-send.spec.mjs` PASS |

## 通過／不通過

| 檢查 | 結果 | 備註 |
|------|------|------|
| 單元 `npm test`（237） | ✅ | 含 `controller-source-number.test.js` |
| e2e 快速送號回歸 | ✅ | `home-board-quick-send-one.spec.mjs` |
| e2e 背景分頁 | ✅ | `home-board-background-tab.spec.mjs` |
| e2e 來源雙格 | ✅ | `controller-source-quick-send.spec.mjs` |
| 真雲端四來源 | ⏭️ | 依 spec 先不做；payload 已單測鎖定 |
| CI `test` + `e2e-live-cloud` | 待 PR | `board-column-move.spec.mjs:124` 若偶發 FAIL 屬已知 flaky |

## 手動驗收（UAT）

1. 開 `controller/?mode=local`，確認「送出號碼」上方有 **來源**（預設門市）與 **號碼**。
2. 選 Uber Eats、輸入 `c7458` → 送出 → 看板可取餐區顯示 **C7458** 且帶 Uber 標籤。
3. 再選門市、輸入 `1234` → 送出 → 與步驟 2 為 **兩格**（同數字不同來源）。
4. 選門市、輸入 `abc` → 送出 → **不出現新號**，紅字提示 4 位數字。

## 截圖

- `artifacts/controller-source/controller-1920-quick-source.png`（1920×1080，來源 Uber Eats）

## PR 摘要

**What：** 控制端快速送號區新增來源／號碼欄；驗證重用 `normalizeBoardDisplayNumber`；雲端 `push_numbers` 改送 `{ no, sourceType }`（向後相容字串陣列）。

**Why：** 測試與展示需依外送／迷點規則送號，並為後端 ticket 格式預留。

**How to test：** `npm test`；`npx playwright test tests/e2e/controller-source-quick-send.spec.mjs tests/e2e/home-board-quick-send-one.spec.mjs`。
