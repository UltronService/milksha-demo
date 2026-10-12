# PR #53 真雲重跑（fixed harness）

Store: `zz-qa-ci-store` · 各 **30** 輪 · before `4146812` / after `38cf72d` · concurrency `live-cloud-zz-qa-ci-store`

## 稽核（舊資料）

| 問題 | 答案 | 依據 |
| --- | --- | --- |
| (a) 03:36 30 輪 cross-zone 是否同一 harness / allocateOrderNumber 路徑？ | **是** | 舊 `artifacts/pr53-live/real-cloud-harness.mjs` `fireTicket`：`fill(fld-no)` + `click(btn-add-ticket)`（`cursor/pr53-live-diagnose-ed3b` 該檔 L79–82）→ `controller/controller-app.js` `btn-add-ticket` L1868–1871 呼叫 `allocateOrderNumber()` L662–684 |
| (b) 4K「>3s 5→16 輪」是否受 +1 欄位影響？ | **是（page-turn 指標）／否（fresh-latency 腳本）** | `missingOver3sCount`：`midNo=7200+c` 後 3s 內等 prep DOM（`real-cloud-harness.mjs` L147–159、L212–213）；ready seed 若誤送 prep 號會 inflate。`scripts/fresh-latency-pause-live-qa.mjs` L140–147 僅 `btn-send-numbers`，**非** fld-no race。 |

## 重跑結果（explicit push + push assert）

| 指標 | 1080 before | 1080 after | 4K before | 4K after |
| --- | --- | --- | --- | --- |
| cross-zone 輪數 | _GHA 進行中_ | _GHA 進行中_ | _GHA 進行中_ | _GHA 進行中_ |
| >3s 輪數 | _GHA 進行中_ | _GHA 進行中_ | _GHA 進行中_ | _GHA 進行中_ |
| QA set 不合 | — | — | — | — |
| slot 不合 | — | — | — | — |

Workflow: `pr53-rerun-compare.yml`（commit 見 branch `cursor/cross-zone-leak-diagnose`）。
