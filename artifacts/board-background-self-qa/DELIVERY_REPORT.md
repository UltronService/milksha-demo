# Board background self-QA (1007)

- **HEAD:** `f4152c90c91cc9dccaa0559ea3185c28ef026032`
- **Base:** `6ef1359cea99cccb5dda74afeed7003888518515`
- **Font:** 81px Arial/Arimo; ink cap/width vs ref ±5% (canvas measureText)
- **Grid:** fixed column X + uniform row pitch (reference averages)

## Root cause (prep order on compare)
Compare 圖曾亂序：同一 page 先跑 three-3 再跑 full-10 時 metaById 保留舊 firstSeenAt，準備中 ascending 排序把舊號排到左上。已改 descending + 每次 ref 前 applyPayload([])。

## Reference payload (all evidence shots)
- Numbers: 1907, 1906, 1905, 1904, 1903, 1902, 1901, 1900, 1899, 1898
- `buildRefBoardPayload()` + `applyPayload([])` before each capture

## Artifacts
- `cell-alignment-gaps.json` — per-cell DOM box + measureText ink vs reference
- `screenshots/compare-full-10-vs-ref-1920.png` from `board-ref-compare-source-1920.png`
- `screenshots/overlay-full-10-vs-ref-1920.png`
- Scenarios + letterbox (see screenshots/)

## CI
- Run on this HEAD (see GitHub Actions after push)
