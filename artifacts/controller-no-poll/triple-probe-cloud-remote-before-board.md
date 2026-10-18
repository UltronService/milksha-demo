# Triple probe: `controller before board opened`（同 CI 環境變數）

- **Spec**: `tests/e2e/cloud-remote-send.spec.mjs` `-g "controller before board opened"`
- **Env**: `MILKSHA_CI_TIER=pr`, `FONTCONFIG_FILE=tests/e2e/fonts/fontconfig-e2e.conf`
- **不在 main 38 項基準**；用於說明非分支獨有回歸。

| Ref | 結果 | 紀錄 |
|-----|------|------|
| `main` @ `2f9b2bf`（`main-worktree`） | **3/3 PASS** | `triple-cloud-remote-before-board-main.log` |
| 分支 @ `ab3284c` | **3/3 PASS** | `triple-cloud-remote-before-board-branch.log` |

**CI `39132334019`（`ab3284c`）**：此用例**未**出現在 failed log 中。
