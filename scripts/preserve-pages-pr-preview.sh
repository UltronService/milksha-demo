#!/usr/bin/env bash
# Merge existing live pr-preview/* trees into deploy-site (see preserve-pages-pr-preview.mjs).
set -euo pipefail
DEPLOY_SITE="${1:-deploy-site}"
CURRENT_PR="${2:-}"
exec node "$(dirname "$0")/preserve-pages-pr-preview.mjs" "$DEPLOY_SITE" "$CURRENT_PR"
