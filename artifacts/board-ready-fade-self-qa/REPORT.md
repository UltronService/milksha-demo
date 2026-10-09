# 請取餐放大淡入（scale pulse）自測報告

- **HEAD**: `0eebd5e0c8cad64784689d097e260bfeabca0583`
- **PR**: https://github.com/UltronService/milksha-demo/pull/36
- **CI**: pending
- **Base**: `c601df6`

## 規格（07:45 台北決議）

請取餐新號：**固定 `readyScale`（預設 1.3×）**，opacity 0→1 同時放大（~0.3s）→ hold 3s → 縮回（~0.3s）；僅 `transform` + `opacity`。**不再**依鄰格自動降倍（已移除 `computeChipPulseScale` 上限與 `animScaleUnsafe`）。倍數仍可由 URL `animScale` 覆寫（`milksha-board-anim-config.js`）。

## URL 參數

| 參數 | 欄位 | 預設 | 範圍 |
|------|------|------|------|
| `animOpacityIn` | opacityInMs | 300ms | 50–2000 |
| `animPage` | pageDurationMs | 500ms | 100–3000 |
| `animScale` | readyScale | **1.3** | 1–1.5 |
| `animIn` / `animHold` / `animOut` | 進／停／出 | 300ms / 3000ms / 300ms | &lt;60 視為**秒** |

## 1.3× 滿格重疊驗證（10 格 × 2 解析度）

滿格 `9990–9999`，逐格 re-pulse（該格 prep→ready），hold 中量測放大外框與鄰格／請取餐區。

| 解析度 | 最小鄰距（10 格皆同） | 任一重疊 | 出區 |
|--------|----------------------|----------|------|
| 1920×1080 | **17.3 px** | 無 | 無 |
| 3840×2160 | **87.2 px** | 無 | 無 |

完整逐格：`pulse-gap-report.json`。E2E：`board-ready-scale-overlap-grid.spec.mjs`（20 cases）。

## 截圖（整頁 1.3×，最緊鄰距格）

| 解析度 | 檔案 |
|--------|------|
| 1080 | `screenshots/1920x1080-fullboard-scale-1_3-worst-cell-0-gap-17_3.png`（+ zoom2x） |
| 4K | `screenshots/3840x2160-fullboard-scale-1_3-worst-cell-0-gap-87_2.png`（+ zoom2x） |

`fullboard-scale-manifest.json`

## 自動化

| 項目 | 結果 |
|------|------|
| `npm test` | **169 passed** |
| `npx playwright test board-animation board-ready-scale-overlap` | **32+ passed**（含 20 overlap） |
| `npm run test:e2e` 全量 | 見 CI |

## 動態預覽頁

未實作；不改控制端。
