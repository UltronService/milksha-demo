# 請取餐放大淡入（scale pulse）自測報告

- **HEAD**: `7c437e1c581a9b51d44b0962134dbe73e785585f`
- **PR**: https://github.com/UltronService/milksha-demo/pull/36
- **CI（本 REPORT HEAD）**: https://github.com/UltronService/milksha-demo/actions/runs/37953057571 — **success**（功能 `07a400c`：[37941553872](https://github.com/UltronService/milksha-demo/actions/runs/37941553872)；`a4edc48`：[37940995898](https://github.com/UltronService/milksha-demo/actions/runs/37940995898)）
- **Base**: `c601df6`

## 規格摘要

請取餐新號：**opacity 0→1 + scale 1→peak→1**（預設 peak 請求 1.3×，實際取安全上限），停留 3s、進出各 ~0.3s；僅 transform + opacity。多張同批一起 pulse。first / silent / force / reduced-motion / 無 WAAPI **不 pulse**。

## URL 參數

| 參數 | 欄位 | 預設 | 範圍 |
|------|------|------|------|
| `animOpacityIn` | opacityInMs | 300ms | 50–2000 |
| `animPage` | pageDurationMs | 500ms | 100–3000 |
| `animScale` | readyScale | 1.3 | 1–1.5 |
| `animIn` / `animHold` / `animOut` | 進／停／出 | 300ms / 3000ms / 300ms | &lt;60 視為**秒** |
| **`animScaleUnsafe=1`** | — | 關 | 為 1 時**不套用安全上限**，強制使用 `animScale`（對照用） |

## 安全倍數（負責人決策用）

### a. 量測與 1.048／1.069 怎麼來

CSS 格線（`milksha-board.css`）：`column-gap: 8px`、`row-gap: 4px`；請取餐區 `.milksha-zone-body` 左右 padding 約 **28px**（landscape-art 約 26px）。

**1920×1080、滿格 10 筆 `9990–9999`（4 位最寬）**（`safe-scale-measurements.json`）：

| 項目 | px |
|------|-----|
| 格子寬 × 高 | 187 × 81 |
| 號碼字寬（chip 寬） | **238** × 103 |
| 欄間距（設計） | 8 |

**公式（每個 pulse 的 chip 獨立算，`computeChipPulseScale`）**：

1. **格邊**：`s ≤ 1 + min(距左/右/上/下格邊) / hw`（`hw` = chip 寬一半）
2. **請取餐區外框**：同上，對 `.milksha-zone.ready` 外框
3. **有號的鄰格**（上下左右格有 chip）：`s ≤ 中心距 / (hw + hw鄰)`
4. **鄰格空白**：不套用第 3 條，該方向僅受格邊／區邊限制

滿格時最緊的通常是**靠區邊或左右都有鄰號**的格子；全層 `layerSafeMin`（所有 chip 安全值取 min）**1080 ≈ 1.069**、**4K ≈ 1.196**。先前 perf 腳本用 `999x` 量到 **~1.048** 是同公式、字寬略小所致。

`effective = min(readyScale, chipSafeMax)`；預設請求 1.3，滿格邊角 chip 實際約 **1.069×（1080）**。

### b. 是否只有滿格才是 1.048？

**否。** 依**當下版面逐 chip**計算（已實作）：

| 情境 | 1080 每 chip safeMax（摘要） | 4K layerSafeMin |
|------|------------------------------|-----------------|
| 滿格 10×9999 | 多數 **1.069**；中列部分格 **1.3**（鄰距較大） | **1.196** |
| 僅 1 張（角上） | **1.3**（無鄰號） | **1.3** |
| 3 張 | 靠邊 **1.116**；單靠角 **1.3** | 見 JSON |
| 僅 1–3 張時 | 常可達 **1.3** | 常 **1.3** |

新叫進的號只用自己的 `chipSafeMax`，不會被「全場最緊格」拖累。

### c. 對照截圖（整頁 viewport、請取餐滿格 9990–9999、新叫 9999 pulse hold）

拍攝條件：先 silent 9 筆再第 10 筆觸發 pulse；`transform` scale 進 hold 後量測（見 `compare-shots-manifest.json`）。

| 解析度 | 安全（實測 scale） | 強制 1.3（`animScaleUnsafe=1`） | 2× 鄰格裁切 |
|--------|-------------------|----------------------------------|-------------|
| 1080 | `1920x1080-fullboard-safe-scale-1_075.png`（**1.075×**，鄰距 26.4px） | `1920x1080-fullboard-unsafe-scale-1_3.png`（**1.3×**，鄰距 17.3px） | `*-zoom2x.png` |
| 4K | `3840x2160-fullboard-safe-scale-1_075.png`（**1.075×**） | `3840x2160-fullboard-unsafe-scale-1_3.png`（**1.3×**） | `*-zoom2x.png` |

安全／unsafe 全頁 PNG **md5 不同**（`board-ready-scale-compare-shots.spec.mjs` 斷言）。預設仍走安全上限；unsafe 僅 QA 對照。

## 自動化

| 項目 | 結果 |
|------|------|
| `npm test` | **169 passed** |
| `npx playwright test board-animation board-ready-scale` | **15 passed** |
| `npm run test:e2e` 全量（CI run 37953057571） | **164 passed**, **0 failed**, **1 skipped** |
| `npm run test:e2e` 全量（本機，無 CI 字型步驟） | **156 passed**, **2 failed**, **4 skipped** |

本機失敗（非看板 pulse）：`guest-clock`（Roboto 字型）、`home-board-first-number-after-open`（flake）。CI 全綠。

## 真雲端 zz-qa-store-a（3 次 ms）

**25, 932, 833**（`live-cloud-samples.json`）

## 效能 4× CPU（ready pulse）

| 解析度 | fps | >50ms | longtask | 備註 |
|--------|-----|-------|----------|------|
| 1080 | 60.2 | 0 | 0 | `metrics.json` |
| 4K | 60.0 | 0 | 0 | |

## Contact sheet

`contact-sheets/*-ready-fade-in.jpg`（prep→ready 連續幀）

## 動態預覽頁

未實作（估 3–4h）；不改控制端。
