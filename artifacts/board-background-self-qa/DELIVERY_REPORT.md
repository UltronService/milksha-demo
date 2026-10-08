# Board background self-QA (1007)

- **HEAD:** `edf4b6a0947dca87f55e5dde675c9d89b92eb0e8`
- **Base:** `6ef1359cea99cccb5dda74afeed7003888518515` (main, #25 merged)
- **Measured grid:** `js/board/landscape-art-layout.js` + `reference/measured-layout.json`
- **Reference numbers (both zones):** 1907, 1906, 1905, 1904, 1903, 1902, 1901, 1900, 1899, 1898

## Tests
- `npm test`: 141/141
- `home-board-art-alignment.spec.mjs`: 1920 + 3840
- Full e2e: see CI on HEAD

## Screenshots
- `screenshots/board-empty-0-1920.png`
- `screenshots/board-empty-0-3840.png`
- `screenshots/board-full-10-1920.png`
- `screenshots/board-full-10-3840.png`
- `screenshots/board-page2-11-1920.png`
- `screenshots/board-page2-11-3840.png`
- `screenshots/board-three-3-1920.png`
- `screenshots/board-three-3-3840.png`
- `screenshots/letterbox-1440x1080.png`
- `screenshots/letterbox-1920x800.png`
- `screenshots/compare-full-10-vs-ref-1920.png` (左實作 / 右參考)
- `screenshots/overlay-full-10-vs-ref-1920.png` (50% 疊圖)

## Alignment gaps
- `cell-alignment-gaps.json` (per-cell dx/dy vs reference, 1920 board coords)

## Letterbox
- Black `#000` bars: `letterbox-1440x1080.png`, `letterbox-1920x800.png`
