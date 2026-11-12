#!/usr/bin/env bash
set -euo pipefail

for package in "$@"; do
  case "$package" in
    strahovcrazyshow-game|strahovcrazyshow-rag-tools|strahovcrazyshow-release) ;;
    *) exit 2 ;;
  esac
  status=$(curl --silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}' \
    --get --data-urlencode 'service=ghcr.io' --data-urlencode "scope=repository:varnahg/$package:pull" \
    https://ghcr.io/token)
  if [[ "$status" != 403 && "$status" != 401 ]]; then
    printf 'GHCR package %s is not confirmed private (anonymous HTTP %s).\n' "$package" "$status" >&2
    exit 1
  fi
done
