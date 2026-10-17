# PR #95 — 看板 Uber 六碼＋圖示欄寬溢出（調查／紅測）

- **分支：** `cursor/controller-default-number-5dd5`（PR #95）
- **HEAD（調查時）：** `82dcb56`
- **店別政策：** 僅 `zz-qa-ci-store`（本紅測用 fake cloud `mode=local`，不碰 `c030020` / `a17` / `s120030`）
- **狀態：** 僅紅測＋假設，**尚未實作修正**（待 owner 核准假設後再改 JS/CSS）

## 1. 失敗中的 Playwright 重現指令

在 repo 根目錄執行（會啟動 `tests/e2e/web-server.mjs`、量測 bounding box、並在兩種解析度截圖）：

```bash
MILKSHA_PR95_OVERFLOW_ARTIFACTS="$PWD/artifacts/pr95-overflow" \
  npx playwright test tests/e2e/board-uber-six-char-column-overflow.spec.mjs
```

**預期（修正前）：** 3 例全紅。

| 案例 | 失敗原因（摘要） |
|------|------------------|
| `1920x1080` | 六碼內容右緣 `1567.8` > 欄帶右界 `1486`；六碼與四碼同為 70px |
| `3840x2160` | 同上（畫布等比放大，欄界仍 1486 設計座標） |
| `scale fit API` | 尚無 `QMS.Board.ChipOverflowFit` 探針 |

**截圖輸出（執行後本機產生，不進 CI commit）：**

- `artifacts/pr95-overflow/screenshots/board-uber-six-char-1920x1080.png`
- `artifacts/pr95-overflow/screenshots/board-uber-six-char-3840x2160.png`

畫面內容：請取餐左欄相鄰兩格——門市 `1234`（四碼）與 Uber `WWWWWW`（六碼＋圖示）。  
`WWWWWW` 為合法 6 位英數中 **Arial 字寬最寬** 的組合，用來穩定重現溢出；實際六碼若含 `W`/`M` 等寬字元亦會踩線。

## 2. 假設（依可能性排序，待核准）

1. **六碼全尺寸 70px 加上圖示槽與間距後，墨水右緣超過 `LandscapeArtLayout.columnInnerRectsBoard` 右界，且沒有 per-chip 縮放。**  
   **驗證：** 跑上方 Playwright；看 `content right > col 1486` 與截圖右緣切到相鄰欄。

2. **`.milksha-num-cell` 寬度被 `calc(--milksha-icon-slot-w * 2.2)`（約 118.8px）卡住，chip 盒很窄，但 `.milksha-num` 與 `overflow: visible` 讓字畫超出欄帶。**  
   **驗證：** DevTools 比對 `chip.getBoundingClientRect().width` 與 `num.getBoundingClientRect().right`（本測已量：chip ≈ 118.8、num right ≈ 1567.8）。

3. **橫向藝術版把圖示固定 54px／間距 14px，字卻 70px，與 PR #74「圖示高 = 字高 × 0.8、間距 = 字高 × 0.2」不一致，有效內容寬度被放大。**  
   **驗證：** 讀 `.milksha-board--landscape-art` 上 `--milksha-icon-box` / `--milksha-icon-gap` 與 `--milksha-num-font`（70px）。

4. **沒有在「新增號碼／換頁」時做一次欄寬比例計算，也沒有 `ChipOverflowFit` 類 API，故無法滿足 STB「非每 frame 重算」與單步 ratio 規格。**  
   **驗證：** 紅測第三例 `missing-fit-api`；修正後應有 `getScaleInvocationCount()` 且 idle 45 frame `delta === 0`。

5. **若只縮文字不動圖示槽，六碼仍可能壓到圖或超出；需整列 icon+gap+num 用同一 scale（規格 c–d），目前完全未做。**  
   **驗證：** 修正後紅測會檢查六碼 `font*0.8` 圖高、`font*0.2` 間距，且四碼字級維持 70px。

## 3. 紅色回歸測試（對應規格 a–f）

| 檔案 | 涵蓋 |
|------|------|
| `tests/e2e/board-uber-six-char-column-overflow.spec.mjs` | 兩解析度 bbox＋截圖 |
| `tests/e2e/board-uber-six-char-column-overflow-helpers.mjs` | 量測與規則 (a)–(d) 斷言 |

| 規格 | 測試如何檢查（修正後應全綠） |
|------|------------------------------|
| (a) 不換行、不截斷、不蓋圖、不出欄 | `white-space: nowrap`、scrollWidth、num/icon 不重疊、`content.right ≤ columnInner.right` |
| (b) 只縮溢出的六碼 | 溢出時 `six.fontPx < four.fontPx` 且 `four.fontPx === baseFont` |
| (c) 圖示高 = 字高×0.8，間距同比例 | 六碼 chip 上 icon 高與 gap 與 `fontPx` 比對 |
| (d) 下限 75% | 溢出時 `six.fontPx ≥ base×0.75`（仍放不下則實作端應報 failure；測試保留下限） |
| (e) 非每 frame 重算 | `ChipOverflowFit.getScaleInvocationCount` idle 不增加 |
| (f) 舊 WebView | 見下方手動／CI 外步驟 |

## 4. 舊版 Chrome／WebView 驗證（規格 f）

修正核准後，除預設 Playwright Chromium 外，**至少再跑一輪舊核心**（建議對應門市 STB 實際 WebView 大版本，例如 Chromium 70–91）：

```bash
# 範例：與 CI 同版 Playwright 容器（可換成你們 STB 對標的舊 Chromium 映像）
docker run --rm -v "$PWD":/work -w /work -e MILKSHA_PR95_OVERFLOW_ARTIFACTS=/work/artifacts/pr95-overflow \
  mcr.microsoft.com/playwright:v1.49.0-jammy \
  npx playwright test tests/e2e/board-uber-six-char-column-overflow.spec.mjs
```

若 STB 為 **Android System WebView 78–91**，請在實機或 BrowserStack 開 `/?mode=local&motion=off`，送同一 payload（門市 `1234` + Uber `WWWWWW`），目視六碼不切欄、四碼大小不變。

## 5. 修正工時估計（Cursor agent，核准後）

| 項目 | 分鐘 |
|------|------|
| `ChipOverflowFit` 單步 ratio（含 75% 下限與 failure 路徑） | 25–35 |
| 掛在新增號碼／換頁、探針 API、舊 WebView 相容（`transform`/`font-size` 路徑） | 15–25 |
| 紅測轉綠＋`npm test` 相關單元 | 10–15 |
| **合計** | **約 50–75 分鐘** |

## 6. 結構化除錯紀錄（diagnosing-bugs）

| 步驟 | 結果 |
|------|------|
| 重現 | 上述 Playwright；1920／3840 皆 `overflow ≈ +81.8px`（設計座標） |
| 量測 | 欄帶右界 1486；六碼墨水右界 1567.8；chip 盒僅 118.8px 寬 |
| 紅測 | 已加入，修正前預期失敗 |
| 修正 | **刻意未寫**（等假設核准） |

## UAT（PM 肉眼驗收，修正後）

1. 開看板 `/?mode=local&motion=off`（全螢幕 1920×1080）。
2. 送門市可取餐 `1234` 與 Uber 六碼 `WWWWWW`（或現場真實最寬六碼）。
3. 請取餐左欄上、下兩格應並排可見：上／下其中一格四碼、另一格六碼＋Uber 圖。
4. 六碼整段（圖＋字）不應碰到右側奶油色邊或隔壁欄；四碼字級明顯不小於六碼。
5. 改 4K 全螢幕重複步驟 3–4，結果一致。

## PR 摘要（本 commit，僅調查）

**What：** 新增 PR #95 溢出紅測與調查報告。  
**Why：** 六碼 Uber＋圖示在 1080p／4K 超出欄寬，需先有失敗測試與假設再實作。  
**How to test：** 見第 1 節指令；預期 3 failed。
