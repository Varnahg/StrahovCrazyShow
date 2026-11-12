#!/usr/bin/env bash
set -euo pipefail

prepare=false
if [[ "${1:-}" == --prepare ]]; then
  prepare=true
  shift
fi

anonymous_status() {
  curl --silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}' \
    --get --data-urlencode 'service=ghcr.io' --data-urlencode "scope=repository:varnahg/$1:pull" \
    https://ghcr.io/token
}

seed_empty_package() (
  stage=$(mktemp -d)
  trap 'rm -f -- "$stage/registry-bootstrap.json"; rmdir -- "$stage"' EXIT
  cd "$stage"
  printf '%s\n' '{"bootstrap":true}' > registry-bootstrap.json
  oras push --artifact-type application/vnd.strahov.registry-bootstrap.v1+json \
    "ghcr.io/varnahg/$1:registry-bootstrap" registry-bootstrap.json:application/json
)

for package in "$@"; do
  case "$package" in
    strahovcrazyshow-game|strahovcrazyshow-rag-tools|strahovcrazyshow-release) ;;
    *) exit 2 ;;
  esac
  status=$(anonymous_status "$package")
  if [[ "$status" == 403 && "$prepare" == true ]]; then
    # GHCR can create packages from a public repository as public. Publish only
    # a fixed placeholder until an operator has made that package private.
    seed_empty_package "$package"
    status=$(anonymous_status "$package")
  fi
  if [[ "$status" != 401 ]]; then
    printf 'GHCR package %s is not confirmed private (anonymous HTTP %s).\n' "$package" "$status" >&2
    exit 1
  fi
done
