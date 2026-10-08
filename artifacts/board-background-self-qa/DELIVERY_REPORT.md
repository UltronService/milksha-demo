# Board background self-QA (1007)

- HEAD: `5d9e6ace4458052a02266a4e3986fb8aeb52f1d7`
- Generated: 2026-10-08T15:51:39.691Z

## Scenarios
- empty-0: prep 0, ready 0
- three-3: prep 3, ready 0
- full-10: prep 10, ready 10
- page2-11: prep 11, ready 11

## Screenshots
- `artifacts/board-background-self-qa/screenshots/board-empty-0-1920.png`
- `artifacts/board-background-self-qa/screenshots/board-empty-0-3840.png`
- `artifacts/board-background-self-qa/screenshots/board-full-10-1920.png`
- `artifacts/board-background-self-qa/screenshots/board-full-10-3840.png`
- `artifacts/board-background-self-qa/screenshots/board-page2-11-1920.png`
- `artifacts/board-background-self-qa/screenshots/board-page2-11-3840.png`
- `artifacts/board-background-self-qa/screenshots/board-three-3-1920.png`
- `artifacts/board-background-self-qa/screenshots/board-three-3-3840.png`

## Reference compare (1920, 10 numbers)
- Side-by-side: `screenshots/compare-full-10-vs-ref-1920.png`

## Notes
- Titles are baked into `assets/milksha-board-bg-1007.jpg`; DOM titles kept for tests (`visibility:hidden`).
- Numbers: Arial, Arimo fallback; cream panels transparent over art.
