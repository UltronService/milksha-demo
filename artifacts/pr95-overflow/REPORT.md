# PR #95 — 看板 Uber 六碼＋圖示欄寬溢出（修正）

- **分支：** `cursor/controller-default-number-5dd5`（PR #95）
- **調查紅測：** `1898fcd`
- **修正 HEAD：** （push 後由 CI 為準，見下方連結）
- **店別：** 僅 `zz-qa-ci-store` 政策；本測 `mode=local` fake cloud
- **Asset version：** `20261017b`

## 結果

| 項目 | 狀態 |
|------|------|
| 紅測 `board-uber-six-char-column-overflow.spec.mjs`（5 例） | **通過** |
| `npm test`（含 `chip-overflow-fit.test.js`、stress cream bounds） | **通過** |
| 背景分頁 `home-board-background-tab.spec.mjs` | **通過** |
| Docker 舊 Chromium 映像 | **本 VM 無 docker**；見下方替代驗證 |

## 假設核對（負責人 2026-10-17 20:01 核准）

| # | 假設 | 結果 |
|---|------|------|
| 1 | 六碼全尺寸 70px＋圖示超出 `columnInnerRectsBoard`、無 per-chip 縮放 | **成立** → 已加 `ChipOverflowFit` 單步 ratio |
| 2 | `num-cell` 寬 ~118px、字 `overflow: visible` 穿出欄帶 | **成立** → 溢出格加 `--overflow-fit` 與 `max-width` |
| 3 | 橫向藝術版固定 54/14px 與 70px 字不一致 | **部分成立** → 僅縮放格改用 PR #74 比例 CSS 變數 |
| 4 | 無換頁／新增時的一次性計算與探針 | **成立** → `applyChipOverflowFitNow`＋`getScaleInvocationCount` |
| 5 | 需 icon+gap+num 同倍縮放 | **成立** → `.milksha-board-chip--overflow-fit` |

## 實作摘要

- **`js/board/chip-overflow-fit.js`**：`naturalContentWidthPx`（1.0F+0.2F+字寬）→ `computeFitScale`（一步、下限 0.75、2px 安全邊）；僅溢出格套用；`console.warn` 每 `itemId` 一次。
- **`js/milksha-board.js`**：在 `renderBoard`／`syncZone` 完成／換頁後呼叫 `applyChipOverflowFitNow`（非每 frame）。
- **`css/milksha-board.css`**：溢出格 scaled 字／圖示／間距。

## Playwright 重現（應全綠）

```bash
MILKSHA_PR95_OVERFLOW_ARTIFACTS="$PWD/artifacts/pr95-overflow" \
  npx playwright test tests/e2e/board-uber-six-char-column-overflow.spec.mjs
```

## 截圖（`1234` 與 `WWWWWW` 左欄相鄰）

- `artifacts/pr95-overflow/screenshots/board-uber-six-char-1920x1080.png`
- `artifacts/pr95-overflow/screenshots/board-uber-six-char-3840x2160.png`

## 舊 WebView／Chromium

本機已跑：Playwright **Chromium 131**（與 CI e2e 相同）。

建議 STB 對標再跑（需 docker）：

```bash
docker run --rm -v "$PWD":/work -w /work \
  -e MILKSHA_PR95_OVERFLOW_ARTIFACTS=/work/artifacts/pr95-overflow \
  mcr.microsoft.com/playwright:v1.49.0-jammy \
  npx playwright test tests/e2e/board-uber-six-char-column-overflow.spec.mjs
```

## CI

- （push 後填入）https://github.com/UltronService/milksha-demo/actions/workflows/ci.yml

## UAT（PM）

1. 全螢幕 1920 開 `/?mode=local&motion=off`。
2. 送門市可取餐 `1234`、Uber `WWWWWW`。
3. 左欄兩格：四碼字級正常、六碼略小且整段（圖＋字）不超出奶油色欄內側。
4. 4K 重複 2–3。

## PR 摘要

**What：** 僅縮超出欄寬的單格；號碼／圖示／間距同比例（min 75%）；新增／換頁算一次。  
**Why：** 六碼 Uber＋圖示在 1080p／4K 溢出欄界。  
**How to test：** 上方 Playwright＋`npm test`。
