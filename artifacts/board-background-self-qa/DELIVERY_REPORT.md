# Board background self-QA (1007)

- **HEAD:** `18505b67049eec3fc99e0e461671305662e17eae`
- **Base:** `6ef1359cea99cccb5dda74afeed7003888518515` (main, #25 merged)
- **CI:** **SUCCESS** https://github.com/UltronService/milksha-demo/actions/runs/37821353022
- **mergeable_state:** `MERGEABLE` / `CLEAN`（CI 綠後）
- **Measured grid:** `js/board/landscape-art-layout.js` + `reference/measured-layout.json`
- **Reference numbers (both zones):** 1907, 1906, 1905, 1904, 1903, 1902, 1901, 1900, 1899, 1898（準備用 `milksha_point`、取餐用 `store`，避免同號去重）

## Tests

| 項目 | 結果 |
|------|------|
| `npm test` | 141 / 141 |
| `home-board-art-alignment.spec.mjs` | 1920 + 3840 pass（中心 ≤12px、字高 ±10%） |
| `npm run test:e2e`（本機） | 125 pass，4 skipped，1 fail `guest-clock` Roboto 環境 |
| **GitHub CI** | **125+ e2e + unit 全綠**（見上連結） |

## Screenshots

`artifacts/board-background-self-qa/screenshots/`

- 情境 0/3/10/11+ × 1920、3840
- `compare-full-10-vs-ref-1920.png`（左實作 / 右參考，雙邊各 10 格）
- `overlay-full-10-vs-ref-1920.png`（50% 疊圖）
- 黑邊：`letterbox-1440x1080.png`、`letterbox-1920x800.png`

## Alignment

- `cell-alignment-gaps.json`：每格 dx/dy（1920 座標，實測 <1px）

## 變更摘要

- 底圖全幅 + 量測座標絕對定位（62px 字級）
- 留邊 `.milksha-stage` `#000`
- 未改 `cloud-runtime.js`
