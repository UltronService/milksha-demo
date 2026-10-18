# PR #95 — 看板／控制端號碼規則與 milksha-cloud 對齊

- **PR:** https://github.com/UltronService/milksha-demo/pull/95
- **分支:** `cursor/controller-default-number-5dd5`
- **HEAD:** `2d59880`（`4ac628a` 規則實作 + `2d59880` e2e 測資）
- **資產版本:** `20261018a`（> `20261017f`）
- **不合併**

## 規則對照（`sanitizePosTicketDisplayNo`）

| Channel / 來源 | 驗證 | 顯示 |
|----------------|------|------|
| **From_Store**（含 Cancelled） | `/^[0-9]{4}$/`，不 trim | 原樣 |
| **From_milksha_point** | `/^[0-9]{3}$/`，不 trim | 保留前導 0 |
| **From_Udd** | `/^[0-9]{4}$/`，不 trim | 原樣 |
| **From_UberEat** | `trim().toUpperCase()` 後 `/^[0-9A-F]{5}$/` | 大寫 |
| **From_FoodPanda** | `trim()` 後 `/^#[0-9]{4}$/` | 保留 `#` |
| **其他 From_* channel** | 去掉一個前導 `#`、`trim`、`toUpperCase()`， `/^[0-9A-Z]{3,6}$/` | 大寫 |
| **重複 key** | `channel + 號碼`（模組 `duplicateKey`；看板 item id 仍為 `sourceKey:displayNo`） |

實作：`js/board/pos-ticket-display-no.js`；看板 `normalizeBoardDisplayNumber`、控制端 `validateQuickSendNumber`、模擬器 `normalizeSimNumber`。

未知 `From_*`（如 QA `From_CustomPartner_OK`）以 channel 名走「其他」規則（`unk:` 前綴則傳入 `From_CustomPartner`）。

## TDD

- 新增 `tests/pos-ticket-cloud-sanitize.test.js`：各來源 ≥1 合法、≥2 不合法（看板 + 控制端）。
- 先寫測試再改 `js/milksha-board.js`、`controller/controller-send-number.js`、`controller/store-simulation.js`。

## 保留 #95 六字縮小

- `js/board/chip-overflow-fit.js` 未移除。
- E2E：寬 chip 改為 **6 字** 通用 channel `From_WideBench_OK` + `WWWWWW`（Uber 僅 5 hex）；min-scale 失敗日誌仍用 `From_UberEat_OK` + `AB12C`。

## 本機驗證（push 前）

| 項目 | 結果 |
|------|------|
| `node scripts/run-unit-tests.mjs` | **361/361** pass |
| `MILKSHA_CI_TIER=pr npx playwright test tests/e2e/board-uber-six-char-column-overflow.spec.mjs` | **5/5** pass |

## CI

| Run | 連結 | Workflow | 結論 | 說明 |
|-----|------|----------|------|------|
| 規則實作首 push | [39127172806](https://github.com/UltronService/milksha-demo/actions/runs/39127172806) | CI | **紅** | 分支獨有 3：`controller-default-number.spec.mjs` ×3（e2e 仍寫舊預設／規則文案） |
| 證據 run（e2e 測資修正後） | [39128244588](https://github.com/UltronService/milksha-demo/actions/runs/39128244588) | CI | **紅** | **唯一失敗 14 項** ⊆ main **38** 基準；**分支獨有 0** |

**main 38 項基準：** `artifacts/ci-nightly/main-baseline-failures-39105020723.txt`

### Run `39128244588` 失敗清單（對照 baseline）

| # | 失敗測試 | 在 baseline 38？ |
|---|----------|------------------|
| 1 | `board-cell-peak-simulation.spec.mjs:34:3` … 3-min peak | ✓ |
| 2 | `cloud-qa-checklist.spec.mjs:40:3` … cable pull | ✓ |
| 3 | `cloud-remote-send.spec.mjs:89:3` … ten sends | ✓（addendum） |
| 4 | `controller-post-send-board-read-abort.spec.mjs:160:3` | ✓ |
| 5 | `controller-store-picker-evidence.spec.mjs:112:3` | ✓ |
| 6 | `controller-store-picker.spec.mjs:71:3` | ✓ |
| 7 | `forbidden-store-then-qa-isolation.spec.mjs:18:3` | ✓ |
| 8 | `fresh-browser-pause-heartbeat.spec.mjs:24:3` | ✓ |
| 9 | `home-board-cloud-recovery.spec.mjs:16:3` B-N07 | ✓ |
| 10 | `home-board-quick-send-one.spec.mjs:42:1` | ✓ |
| 11 | `home-board-stale-storage.spec.mjs:72:1` | ✓ |
| 12–14 | `home-board-ten-send-clear.spec.mjs:106:3` ×3 參數化 | ✓ |
| 15 | `pr23-login-count.spec.mjs:55:3` 5 min idle | ✓（addendum） |

**相對 baseline 已改善（本 run 未再失敗）：** `controller-source-quick-send.spec.mjs:4:1`、`home-board-art-alignment.spec.mjs:186:3`（迷點 prep 改 3 位測資後）。

## 依舊規則失效、已改測資（未放寬 assertion、未 skip）

| 檔案 | 原測資／期望 | 新測資／期望 |
|------|----------------|----------------|
| `tests/board-display-number-log-rules.test.js` | fp `6405`、point `0912`、udd 英數 | fp `#6405`；`6405`/`0912` 拒絕 |
| `tests/controller-source-number.test.js` / `controller-default-number.test.js` | 同上 | 對齊 cloud |
| `tests/delivery-number-format.test.js` | 舊 fp/uber 長度 | `#6405`、`AB12C` 等 |
| `tests/fixtures/today-board-cloud-tickets.js` | fp 無 `#` | `#6405` / `#6406` |
| `scripts/check-milksha-board-official-layout.mjs` | `6405` | `#6405` |
| `scripts/check-milksha-board-column-alignment.mjs` | 同上 | `#6405` |
| `scripts/capture-milksha-official-board.mjs` | `6405` | `#6405` |
| `demo/milksha-demo-script.json` | `_expectRing` `fp:5037` | `fp:#5037`（`fp:#5038`） |
| `tests/controller-store-simulation.test.js` | 舊 pattern / `randomAlnumNumber` | cloud pattern；uber `AB12C` |
| `tests/e2e/board-uber-six-char-column-overflow-helpers.mjs` | Uber `WWWWWW`（6 hex 已不合法） | `From_WideBench_OK` + `WWWWWW` |
| `tests/e2e/controller-source-live-cloud.spec.mjs` | uber/udd 舊號、`#6406` 顯示 | uber `AB12C`、udd `1234`、`#6406` |
| `tests/e2e/controller-default-number.spec.mjs` | uber `C7458`、fp 舊 rule 文案 | `AB12C`、`# 與 4 位數字` |
| `tests/e2e/controller-source-quick-send.spec.mjs` | uber `1234` | `AB12C` |
| `tests/e2e/board-ref-fixtures.mjs` | 迷點 prep 4 位 `290x` | 3 位 `90x` |
| `tests/milksha-board-official.test.js` | fp 無 `#` | `#6405` |

**仍合法未改：** `delivery-number-qa-live2` 的 Uber `12340`（5 位 hex）；`chip-overflow-fit.test.js` 仍用 `WWWWWW` 量寬。

## 控制端 UX

- 預填：point `012`、uber `AB12C`、fp `#6405`、udd `1234`
- `RULE_NOTE` / `VALIDATION_HINT` 已改為上表規則
