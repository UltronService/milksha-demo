# CI 真雲端測試店切換報告

## 變更摘要

- 新增 `tests/e2e/live-cloud-config.mjs`：`LIVE_CLOUD_STORE_ID`（預設 `zz-qa-ci-store`）
- 新增 `tests/e2e/live-cloud-teardown.mjs`：失敗也會 `停止模擬` + `clear_now` + 看板空號斷言
- 更新 `board-animation-live-cloud.spec.mjs`、`controller-simulation-live-cloud.spec.mjs` 改用共用設定
- `.github/workflows/ci.yml` 注入 `LIVE_CLOUD_STORE_ID: zz-qa-ci-store`

## grep 證明（CI 真雲端路徑無 zz-qa-store-a）

```text
$ rg 'zz-qa-store-a' tests/e2e/*live-cloud* tests/e2e/live-cloud*.mjs .github/workflows/ci.yml
(無匹配)
```

## 本機驗證（zz-qa-ci-store）

| Spec | 結果 |
|------|------|
| `board-animation-live-cloud.spec.mjs` | 1 flaky（首輪 4758ms），retry #1 **passed**（8.7s） |
| `controller-simulation-live-cloud.spec.mjs` | **1 passed**（8.4m） |
| `npm test` | **180/180 passed** |

## Git

- Branch: `cursor/ci-live-cloud-store-d85e`
- Commit SHA: `16dd0ea`

## GitHub Actions

- CI run: _(filled after push)_
