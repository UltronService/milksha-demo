#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
git fetch origin cursor/board-device-command-seq-49e5
git show "origin/cursor/board-device-command-seq-49e5:js/receiver/cloud-runtime.js" > "$ROOT/js/receiver/cloud-runtime.js"
export MILKSHA_QA_PATCH_RUNTIME=1
export PR27_MATRIX_RUNS="${PR27_MATRIX_RUNS:-3}"
mkdir -p artifacts/pr27-matrix
node scripts/public-pages-pr27-matrix.mjs 2>&1 | tee artifacts/pr27-matrix/matrix-with-patch.log
cp artifacts/pr27-matrix/matrix.json artifacts/pr27-matrix/matrix-with-patch.json
git checkout HEAD -- js/receiver/cloud-runtime.js 2>/dev/null || git checkout origin/main -- js/receiver/cloud-runtime.js
