#!/usr/bin/env bash
# Reproduce CI Nightly "No tests found" locally (list only; no live cloud).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "== Playwright version =="
npx playwright --version

echo "== Install browser (same family as nightly; nightly uses --with-deps) =="
npx playwright install chromium

SPECS=(
  tests/e2e/controller-source-live-cloud.spec.mjs
  tests/e2e/board-animation-live-cloud.spec.mjs
  tests/e2e/controller-simulation-live-cloud.spec.mjs
  tests/e2e/home-board-auto-pair-live-cloud.spec.mjs
)

export LIVE_CLOUD_STORE_ID=zz-qa-ci-store
export MILKSHA_E2E_ARTIFACTS="${TMPDIR:-/tmp}/milksha-e2e-artifacts"
export FONTCONFIG_FILE="${ROOT}/tests/e2e/fonts/fontconfig-e2e.conf"
export CI=true

echo "== REPRO: same command as .github/workflows/ci-nightly.yml (expect: No tests found) =="
set +e
npx playwright test --list "${SPECS[@]}"
REPRO_EXIT=$?
set -e
echo "repro exit code: ${REPRO_EXIT}"

echo "== CONTROL: playwright.config.js without testIgnore (expect: 7 tests in 4 files) =="
TMP_CONFIG="${ROOT}/.playwright-nightly-control.config.js"
node <<'NODE'
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const src = fs.readFileSync(path.join(root, 'playwright.config.js'), 'utf8');
const out = src.replace(/  testIgnore: \['\*\*\/\*-live-cloud\.spec\.mjs'\],\n/, '');
fs.writeFileSync(path.join(root, '.playwright-nightly-control.config.js'), out);
NODE
npx playwright test --config="${TMP_CONFIG}" --list "${SPECS[@]}"
rm -f "${TMP_CONFIG}"
