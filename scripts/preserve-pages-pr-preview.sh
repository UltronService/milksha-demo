#!/usr/bin/env bash
# Merge existing live pr-preview/* trees into deploy-site so one PR deploy does not 404 others.
set -euo pipefail

DEPLOY_SITE="${1:-deploy-site}"
CURRENT_PR="${2:-}"

ROOT_URL="https://ultronservice.github.io/milksha-demo"
mkdir -p "${DEPLOY_SITE}/pr-preview"

mapfile -t PR_NUMBERS < <(
  gh pr list --state open --json number,headRefName \
    --jq '.[] | select(.headRefName | startswith("cursor/")) | .number' \
    | sort -nu
)

if [ "${#PR_NUMBERS[@]}" -eq 0 ]; then
  PR_NUMBERS=(123)
fi

for num in "${PR_NUMBERS[@]}"; do
  if [ -n "$CURRENT_PR" ] && [ "$num" = "$CURRENT_PR" ]; then
    continue
  fi
  dest="${DEPLOY_SITE}/pr-preview/pr-${num}"
  if [ -f "${dest}/index.html" ]; then
    echo "preserve: pr-${num} already in artifact"
    continue
  fi
  code="$(curl -sS -o /dev/null -w "%{http_code}" "${ROOT_URL}/pr-preview/pr-${num}/" || echo "000")"
  if [ "$code" != "200" ]; then
    echo "preserve: skip pr-${num} (live HTTP ${code})"
    continue
  fi
  echo "preserve: mirroring live pr-preview/pr-${num}/"
  mkdir -p "$dest"
  (
    cd "$dest"
    wget -q -e robots=off -r -np -nH -l 30 "${ROOT_URL}/pr-preview/pr-${num}/" \
      || curl -fsSL "${ROOT_URL}/pr-preview/pr-${num}/index.html" -o index.html
  )
done
