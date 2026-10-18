#!/usr/bin/env bash
# Reproduce single-spec runs on origin/main (CI-like env). Usage:
#   ./scripts/repro-main-triple-spec.sh cloud-remote-send
#   ./scripts/repro-main-triple-spec.sh pr23-login-count
set -euo pipefail
SPEC="${1:?spec keyword: cloud-remote-send | pr23-login-count}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WT="/tmp/mw-main-repro-${SPEC}"
LOG_DIR="${ROOT}/artifacts/ci-nightly/main-triple-repro-${SPEC}"
mkdir -p "$LOG_DIR"

if [[ ! -d "$WT/.git" ]]; then
  git worktree add "$WT" origin/main -f
fi
cp "$ROOT/playwright.config.js" "$WT/playwright.config.js"

export MILKSHA_CI_TIER=pr
export FONTCONFIG_FILE="$ROOT/tests/e2e/fonts/fontconfig-e2e.conf"
export MILKSHA_E2E_ARTIFACTS="${TMPDIR:-/tmp}/milksha-e2e-artifacts-main-repro"

cd "$WT"
npm ci --silent 2>/dev/null || npm ci
npx playwright install chromium 2>/dev/null || true

case "$SPEC" in
  cloud-remote-send)
    TARGET='tests/e2e/cloud-remote-send.spec.mjs'
    GREP='ten sends produce ten numbers'
    ;;
  pr23-login-count)
    TARGET='tests/e2e/pr23-login-count.spec.mjs'
    GREP='5 min normal board idle'
    ;;
  *)
    echo "unknown spec $SPEC" >&2
    exit 1
    ;;
esac

for run in 1 2 3; do
  echo "=== main run $run/3 $(date -Iseconds) ===" | tee "$LOG_DIR/run-${run}.log"
  if npx playwright test "$TARGET" -g "$GREP" 2>&1 | tee -a "$LOG_DIR/run-${run}.log"; then
    echo "PASS" | tee -a "$LOG_DIR/run-${run}.log"
  else
    echo "FAIL" | tee -a "$LOG_DIR/run-${run}.log"
  fi
done
grep -hE 'PASS|FAIL' "$LOG_DIR"/run-*.log | sort | uniq -c
