# Hypothesis 0 — 共用 store 與 run 38182993862 重疊查核

**目標 run：** [38182993862](https://github.com/UltronService/milksha-demo/actions/runs/38182993862)（Cross-zone leak RED，**有** 7112 leak）

| 時段（台北 UTC+8） | 2026-10-12 **07:06:22** – **07:16:57** |
| Job 實際 | `cross-zone-red` started `2026-10-11T23:06:22Z` → completed `23:16:57Z` |

## Concurrency

| Workflow / Job | `concurrency.group` | 與 38182993862 重疊？ |
| --- | --- | --- |
| `cross-zone-leak-diagnose.yml` → cross-zone-red | `live-cloud-zz-qa-ci-store` | **本 run（獨占）** |
| `ci.yml` → `e2e-live-cloud` | `live-cloud-zz-qa-ci-store` | **否** — 同 push 的 CI [38182998228](https://github.com/UltronService/milksha-demo/actions/runs/38182998228) 中 `e2e-live-cloud` **07:16:59** 才開始（RED 結束後 2 秒） |
| `ci.yml` → `test`（非 live spec） | `ci-${{ pr || ref }}` | 並行但 **不寫** `zz-qa-ci-store` live board |

## 同時間窗內其他 branch / PR（22:50–23:20 UTC ≈ 06:50–07:20 台北）

| Run | Workflow | Branch | 台北時段 | live-cloud job | 7112？ |
| --- | --- | --- | --- | --- | --- |
| 38182993862 | Cross-zone RED | cross-zone-leak-diagnose | 07:06–07:17 | cross-zone-red | 本腳本 **未送** 7112；leak 觀測 |
| 38182998228 | CI | cross-zone-leak-diagnose | test 07:06–07:18；e2e **07:16:59–07:18:18** | e2e 在 RED **之後** | live spec 用 `btn-send-numbers` 預設號，**無 7112** |
| 38182681355 | Cross-zone RED | cross-zone-leak-diagnose | **07:01–07:05** | 前一段排隊 | assert 失敗（全綠），結束後 1 分鐘內開 38182993862 |
| 38183751122 | Cross-zone RED | cross-zone-leak-diagnose | **07:17–07:28** | RED **之後** | 重疊 **非** 38182993862 窗內 |

**PR #52 / #55 / #59 / #57：** 在 **06:50–07:20 台北** 窗內 **無** 新的 `e2e-live-cloud` 或 cross-zone run（`gh run list` 查 branch）。

## 結論（重疊）

- **38182993862 執行當下無第二個 `live-cloud-zz-qa-ci-store` writer**；`e2e-live-cloud` 排隊至 RED 結束後才開跑。
- **7112 來源**在該 run 仍不能仅靠 overlap 解釋；需 **push_numbers + Firestore + apply 逐筆**（見 capture workflow）。
- **假設 H0-other-writer：** 對 **38182993862 時段** → **未證實**；對 repo 整體仍可能（舊 branch 整包 `test:e2e` 見 `artifacts/ci-concurrency/REPORT.md`），**本窗無證據**。

_Capture workflow: `cross-zone-hypothesis0-capture.yml`（45 輪 × 最多 2 次 attempt）。_
