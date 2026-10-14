# Source icons 版面 V1（定稿）

V1：來源 icon 在取餐號**左側**；格內**靠左對齊**（固定左 padding + 統一 icon 槽）。

## 優缺點（一句）

- **優點**：門市與外送號碼起點一致；86px 字重遠距可讀。
- **缺點**：六碼需整列等比縮放才塞進半欄，實際視覺略小於 86px。

## 尺寸（px）

| 項目 | 值 |
|------|-----|
| 格內左 / 右 padding | **14** / **6** |
| Icon 槽（每格固定寬；門市留白） | **130 × 68** |
| 迷點盒（`nidin.svg`，約 1.9:1） | 同槽 **130 × 68** |
| Uber / foodpanda 正方形 icon | **68 × 68**，在槽內置中 |
| Icon 與號碼間距 | **16** |
| 號碼 `font-size` | **86** |
| 整列 `transform: scale` | **0.74**（`transform-origin: left center`；六碼不裁切） |
| 號碼色 | **#222222**（`milksha-board.css`） |

foodpanda 在 68×68 盒內加 **8px** padding。迷點以 `object-fit: contain` 維持比例（SVG 內 `preserveAspectRatio="none"` 不修改）。

## 對齊方式

1. `.mockup-cell`：`justify-content: flex-start` + `padding-left: 14px`。
2. 每格必有 **130px 寬 icon 槽**；門市槽空白，號碼從「槽右緣 + 16px」開始，與有 icon 的格垂直對齊。
3. 橫排結構：`[槽 130][gap 16][號碼]`；Uber／foodpanda 正方形在槽內水平置中。

## nidin.svg

與 `nidin.png` 同識別（藍字 + 粉點）；適合 4K。

## 產出

- `v1.html` / `v1.png`（**1920×1080**）

```bash
cd design-mockups/source-icons/v1
google-chrome --headless=new --disable-gpu --no-sandbox \
  --user-data-dir=/tmp/chrome-v1-shot \
  --window-size=1920,1080 --screenshot=v1.png --hide-scrollbars \
  "file://$(pwd)/v1.html"
```
