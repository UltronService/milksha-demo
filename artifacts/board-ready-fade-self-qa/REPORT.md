# 請取餐淡入（移除 3 秒綠底）自測報告

- **HEAD**: `233b16236c34d17e9749920d9723200ceb1ca5a3`
- **Base**: `c601df6`（main，#35 合併後）
- **分支**: `cursor/board-ready-fade-4ad1`
- **開 PR**: https://github.com/UltronService/milksha-demo/compare/main...cursor/board-ready-fade-4ad1?expand=1
- **CI**: 此 repo CI 僅在 `pull_request` 或 `main` push 觸發；需 collaborator 開 PR 後 Actions 才會跑。開 PR 後請將此段改為該 HEAD 的 run URL 與 conclusion（本 agent 無權建立 PR）。

## 規格變更摘要

| 項目 | 變更 |
|------|------|
| 請取餐新號 | 僅 chip **opacity 0→1**（300ms），與準備中新號相同 |
| 已移除 | `::before` 綠底、`--milksha-ready-highlight`、`milksha-board-chip--highlight` / `--unhighlighting`、`scheduleReadyHighlight`、timer、`highlightReadyIds` |
| 不變 | 準備中淡入／FLIP、離開淡出、取餐淡出補位、換頁 0.5s、清空、skip（first / silent / force） |

## 自動化

| 項目 | 結果 |
|------|------|
| `npm test` | **167 passed** |
| `npx playwright test board-animation` | **13 passed** |
| `npm run test:e2e`（本機） | **154 passed**, **2 failed**, 4 skipped（28.2m） |

本機失敗（與 #35 相同，非本次 CSS 變更）：

1. `guest-clock.spec.mjs` — `Expected /^Roboto/i`, `Received "DejaVu Sans"`（本機未裝 CI Roboto 字型步驟）
2. `home-board-first-number-after-open.spec.mjs` — 首送 >3s flake（單獨重跑常過）

## 真雲端 zz-qa-store-a（送號→請取餐可見，3 次）

見 `live-cloud-samples.json`：

| 次 | ms |
|----|-----|
| 1 | 22 |
| 2 | 841 |
| 3 | 840 |

## 假雲端首送 timeline（#35 項 b）

腳本：`scripts/board-ready-fade-fake-cloud-timeline.mjs` → `fake-cloud-first-send-timeline.json`

**首送 click→`.milksha-ready .milksha-num` 可見（ms），各 5 次：**

| 版本 | run1–5 |
|------|--------|
| **分支**（本 PR） | 367, 387, 401, 385, 400 |
| **main**（`git archive main` 同腳本） | 394, 407, 379, 404, 395 |

**run1 時間軸（分支，自 t0=啟動 fake-cloud 前）：**

| 階段 | ms |
|------|-----|
| fake-cloud listen + 800ms 暖機 | 801 |
| resetCloudState 完成 | 950 |
| board goto 送出 | 1046 |
| `receiverCloud` true（含 devLogin／連線） | 1094 |
| 控制端 online + 首次送號 click | 1245 |
| 請取餐號可見 | 1612（**click→visible 367ms**） |

**結論**：#35 自測單次 **4929ms** 為長時間 qa-pack 冷啟動＋輪詢相位 outlier；本次與 main 同條件首送皆 **&lt;410ms**，**非本分支回歸**。慢段主要在 click 之前的 fake-cloud 啟動與 board／controller 連線，非 opacity 動畫。

## Contact sheet（請取餐淡入）

`contact-sheets/1920x1080-ready-fade-in.jpg`、`3840x2160-ready-fade-in.jpg`（prep→ready 連續幀拼接）。

## 變更檔案（僅看板）

- `css/milksha-board.css`
- `js/board/milksha-board-anim.js`
- `js/milksha-board.js`
- `tests/e2e/board-animation-highlight.spec.mjs`
- `tests/e2e/board-animation.spec.mjs`
