# Nightly live-cloud「No tests found」除錯報告

**Run：** [39170612603](https://github.com/UltronService/milksha-demo/actions/runs/39170612603)  
**Workflow：** `CI Nightly (live cloud)`（`schedule`，非 `workflow_dispatch`）  
**分支 / SHA：** `main` @ `fb8d16285473fc89ab50246485316721eac96bb3`  
**台北時間：** 2026-10-19 06:04 開始 → 06:06 失敗（UTC 2026-10-18 22:04–22:06）

---

## 1. Job log 摘要（`e2e-live-cloud`）

### 工作目錄

- `/home/runner/work/milksha-demo/milksha-demo`（`actions/checkout@v4` 日誌）

### 實際執行的命令（依序）

| 步驟 | 命令 |
|------|------|
| 依賴 | `npm ci` |
| 瀏覽器 | `npx playwright install --with-deps chromium` |
| 字型 | `sudo apt-get update && sudo apt-get install -y fonts-roboto fonts-dejavu-core && fc-cache -f` |
| **失敗步驟** | `npx playwright test tests/e2e/controller-source-live-cloud.spec.mjs tests/e2e/board-animation-live-cloud.spec.mjs tests/e2e/controller-simulation-live-cloud.spec.mjs tests/e2e/home-board-auto-pair-live-cloud.spec.mjs` |

### 失敗步驟環境變數（log 明文）

| 變數 | 值 |
|------|-----|
| `LIVE_CLOUD_STORE_ID` | `zz-qa-ci-store` |
| `MILKSHA_E2E_ARTIFACTS` | `/home/runner/work/_temp/milksha-e2e-artifacts` |
| `FONTCONFIG_FILE` | `/home/runner/work/milksha-demo/milksha-demo/tests/e2e/fonts/fontconfig-e2e.conf` |

**未設定（與 PR CI 對照）：** `MILKSHA_CI_TIER`（`ci.yml` 的 E2E 會設 `pr`）、`GITHUB_TOKEN` 以外無其他自訂 env 出現在該 step。

### Runner / Node

- `ubuntu-24.04`，Node **v20.20.2**，npm **10.8.2**

### Playwright 版本與設定

- **版本：** `@playwright/test` / `playwright` **1.49.0**（`package.json` @ 上述 SHA；本機 `npx playwright --version` 一致）
- **此 run log 未印出** `show-config` 或完整 config dump；失敗訊息僅：

  ```
  Error: No tests found.
  Make sure that arguments are regular expressions matching test files.
  ```

- **repo 內生效的 `playwright.config.js`（SHA `fb8d162`）：**

  | 欄位 | 值 |
  |------|-----|
  | `testDir` | `tests/e2e` |
  | `testIgnore` | `['**/*-live-cloud.spec.mjs']` |
  | `timeout` | `90000` |
  | `workers` | `1` |
  | `fullyParallel` | `false` |
  | `webServer.command` | `node tests/e2e/web-server.mjs` |
  | `webServer.url` | `http://127.0.0.1:${MILKSHA_E2E_PORT\|\|'8877'}/controller/` |
  | `webServer.reuseExistingServer` | `!process.env.CI` → nightly 有 `CI` 時為 **false** |
  | `use.headless` | `true` |

- **無** `projects`、`grep`、`shard` 參數；nightly workflow 也未傳 `--shard`。

### 四支 spec 檔在該 commit 均存在

`tests/e2e/*-live-cloud.spec.mjs` 四檔於 `fb8d162` 皆在 tree 內（非缺檔）。

---

## 2. 本機重現

```bash
./artifacts/nightly-no-tests/repro.sh
```

### 結果（2026-10-18 本機執行）

| 段落 | 預期 | 實際 |
|------|------|------|
| REPRO（預設 `playwright.config.js` + 四檔路徑 `--list`） | No tests found | **Total: 0 tests in 0 files**，exit **1** |
| CONTROL（暫存 config **移除** `testIgnore`） | 列出 live-cloud | **Total: 7 tests in 4 files** |

對照命令（CONTROL 邏輯，手動一行版）：

```bash
# 先 npm ci && npx playwright install chromium
node -e "const fs=require('fs');const p='playwright.config.js';fs.writeFileSync('.pw-ctl.js',fs.readFileSync(p,'utf8').replace(/  testIgnore: \\['\\*\\*\\/\\*-live-cloud\\.spec\\.mjs'\\],\\n/,''));"
npx playwright test --config=.pw-ctl.js --list \
  tests/e2e/controller-source-live-cloud.spec.mjs \
  tests/e2e/board-animation-live-cloud.spec.mjs \
  tests/e2e/controller-simulation-live-cloud.spec.mjs \
  tests/e2e/home-board-auto-pair-live-cloud.spec.mjs
rm -f .pw-ctl.js
```

---

## 3. 可能原因（依可能性排序）

### ① `playwright.config.js` 的 `testIgnore` 排除 `*-live-cloud.spec.mjs`，nightly 未還原（**最可能，已本機證實**）

- **證據**
  - PR [#98](https://github.com/UltronService/milksha-demo/pull/98) commit `6ac3e325`：`fix(ci): shard Playwright via testDir; testIgnore live-cloud specs`，在 `playwright.config.js` 加入 `testIgnore: ['**/*-live-cloud.spec.mjs']`（PR CI 刻意不跑真雲端）。
  - `ci-nightly.yml` 只列四支 live-cloud 路徑，**沒有**像 `ci-main-spec-triple-probe.yml` 那樣在執行前 patch config，也**沒有**依 `MILKSHA_CI_TIER` 動態清掉 `testIgnore`（且 `playwright.config.js` 本身也不讀 `MILKSHA_CI_TIER`）。
  - Playwright 在 CLI 指定檔案時仍套用 `testIgnore`；本機 REPRO / CONTROL 與 run log 的 `No tests found` 一致。
- **驗證**
  - 跑 `repro.sh`；或 `npx playwright test --list <四檔>` → 0 tests。
  - 暫去 `testIgnore` 後 `--list` 同一組路徑 → 7 tests / 4 files。

### ② nightly 與 PR CI 的「分層」假設不一致：以為 env / 檔名列舉可覆蓋 config（**設計缺口**）

- **證據**
  - `ci.yml` 靠 `testIgnore` + `MILKSHA_CI_TIER=pr`（harness 網路 guard）分離 fake vs live；nightly 僅列檔名 + `LIVE_CLOUD_STORE_ID`，未設 nightly tier 或第二份 config。
  - `artifacts/ci-nightly/PLAN.md` 描述 PR tier 與 nightly 分工，但 main 上 config 為**常駐** `testIgnore`，非僅 PR job 注入。
- **驗證**
  - `grep testIgnore playwright.config.js`；`grep MILKSHA ci-nightly.yml`（應無 tier）；比對 `ci-main-spec-triple-probe.yml` 的 sed patch 步驟（nightly 無對應步驟）。

### ③ CLI 參數被當成「正則」且與 `testDir`/`testIgnore` 交集為空（**機制說明，與①同根**）

- **證據**
  - Playwright 錯誤文案：`arguments are regular expressions matching test files`；四條路徑與檔名正確，但 glob 規則先剔除 `*-live-cloud.spec.mjs`，交集為空 → `No tests found`（非「找不到檔案」的 OS 錯誤）。
- **驗證**
  - `npx playwright test --list tests/e2e/board-animation-live-cloud.spec.mjs`（預設 config）→ 0。
  - `npx playwright test --list` 全 suite → 259 tests / 65 files，**不含** live-cloud（被 ignore）。

### ④ 工作目錄或路徑打錯（**可能性低**）

- **證據**
  - Log 工作目錄正確；workflow 路徑與 repo 一致；checkout SHA 上四檔存在。
- **驗證**
  - 在 clone 根目錄 `ls tests/e2e/*-live-cloud.spec.mjs`；CONTROL 能列出 4 files。

### ⑤ shard / project / grep 導致過濾（**可能性極低**）

- **證據**
  - Nightly 無 `--shard`；config 無 `projects`；step 無 `--grep`。
- **驗證**
  - 檢查 `ci-nightly.yml` 與 `playwright.config.js`（本報告 §1 已列）。

---

## 4. 影響（PM 白話）

- **使用者 / 營運：** 每晚排程的「真雲端回歸」在約 2 秒內結束且**完全沒跑**四支 live-cloud 測試，等於**沒有夜間安全網**；問題要到白天手動或合併後才可能發現。
- **不是：** 真雲端連線失敗、號碼送不出去、或四支測試 assertion 失敗——尚未進入測試本體。

---

## 5. 本報告範圍

- **僅調查、未修改** `playwright.config.js`、`ci-nightly.yml`、產品碼。
- **未**手動觸發 nightly / live-cloud workflow。
