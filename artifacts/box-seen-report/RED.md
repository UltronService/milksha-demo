# Box seen report — red milestone

| Milestone | Commit | New failing tests |
|-----------|--------|-------------------|
| Log page format slice | `4230cd3` | 7 |
| Full board reporter slice | `ea33f32` | 16 |

## Full reporter red scope (added tests)

- `tests/box-seen-report.test.js` (11)
- `tests/box-seen-report-cloud-api.test.js` (3)
- `tests/box-seen-report-runtime-hook.test.js` (2)
- `tests/box-seen-report-mutation.test.js` (1)

Run (expect fail before implementation modules):

```bash
node --test tests/box-seen-report.test.js tests/box-seen-report-cloud-api.test.js tests/box-seen-report-runtime-hook.test.js tests/box-seen-report-mutation.test.js
```
