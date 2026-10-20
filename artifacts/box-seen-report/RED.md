# Box seen report — red milestone

- **Branch:** `cursor/box-seen-report`
- **Commit:** (see git log after red commit)
- **New failing tests:** 7

## Scope (this slice)

- `tests/pos-receive-log-format.test.js` — IPv4 mask (`203.69.*.*`), delay ms → seconds (3 decimals), negative delay note
- `tests/pos-receive-log-page.test.js` — column header `比收件晚（秒）`, app wiring

## Run

```bash
node --test tests/pos-receive-log-format.test.js tests/pos-receive-log-page.test.js
```
