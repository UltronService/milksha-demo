#!/usr/bin/env bash
# Diagnostic only: Playwright CDP CPU throttle via node inline (no app code changes).
set -euo pipefail
cd "$(dirname "$0")/../.."
export FONTCONFIG_FILE="$PWD/tests/e2e/fonts/fontconfig-e2e.conf"
export MILKSHA_E2E_ARTIFACTS="${MILKSHA_E2E_ARTIFACTS:-/tmp/milksha-e2e-artifacts}"
mkdir -p "$MILKSHA_E2E_ARTIFACTS"
RATE="${1:-4}"
RUNS="${2:-15}"
pass=0
fail=0
for i in $(seq 1 "$RUNS"); do
  if node artifacts/flaky-column-move/run-one-with-cpu-throttle.mjs "$RATE" >/tmp/flaky-run-$i.log 2>&1; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    echo "run $i FAIL (throttle ${RATE}x)"
  fi
done
echo "throttle=${RATE}x pass=$pass fail=$fail rate=$(( fail * 100 / (pass + fail) ))%"
