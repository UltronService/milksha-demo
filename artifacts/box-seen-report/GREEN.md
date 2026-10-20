# Box seen report — log page format (green)

## Unit tests (3× vs main baseline)

| Run | pass | fail |
|-----|------|------|
| 1 | 349 | 10 |
| 2 | 349 | 10 |
| 3 | 349 | 10 |

Main baseline: **342 pass / 10 fail** (352 tests). This branch adds **7** tests → **349 pass / 10 fail** (359 tests). Failures are the same layout-harness set as `main` (not introduced here).

## New tests

```bash
node --test tests/pos-receive-log-format.test.js tests/pos-receive-log-page.test.js
```

All 7 pass.

## Manual UAT

1. Open `tools/pos-receive-log/index.html` (via static server or GitHub Pages path).
2. Expand the sample「收件 demo-intake」row.
3. Confirm table header includes **比收件晚（秒）**.
4. Row 1: IP shows `203.69.*.*`, delay **1.500**.
5. Row 2: IP `10.1.*.*`, delay **-0.120 兩邊時鐘不同**, 狀態 **未回報**, 時鐘 **未校正**.
