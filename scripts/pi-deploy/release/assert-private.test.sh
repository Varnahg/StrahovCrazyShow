#!/usr/bin/env bash
set -euo pipefail

guard="$(cd "$(dirname "$0")" && pwd)/assert-private.sh"
fixture=$(mktemp -d)
trap 'rm -f -- "$fixture/seeded"; rmdir -- "$fixture"' EXIT
export fixture

curl() {
  if [[ -f "$fixture/seeded" ]]; then printf '%s' "$after_seed"; else printf '%s' "$before_seed"; fi
}

oras() {
  [[ "$1" == push && "$4" == ghcr.io/varnahg/strahovcrazyshow-release:registry-bootstrap ]]
  [[ "$5" == registry-bootstrap.json:application/json ]]
  [[ "$(cat registry-bootstrap.json)" == '{"bootstrap":true}' ]]
  : > "$fixture/seeded"
}

export -f curl oras

check() {
  export before_seed="$1" after_seed="$2"
  local expected="$3" seeded="$4" result=0
  shift 4
  rm -f -- "$fixture/seeded"
  bash "$guard" "$@" strahovcrazyshow-release >/dev/null 2>&1 || result=$?
  [[ "$result" == "$expected" ]]
  if [[ "$seeded" == yes ]]; then [[ -f "$fixture/seeded" ]]; else [[ ! -e "$fixture/seeded" ]]; fi
}

check 401 401 0 no
check 403 401 1 no
check 200 401 1 no --prepare
check 403 200 1 yes --prepare
check 403 401 0 yes --prepare
printf '%s\n' 'PASS private GHCR gate and harmless package bootstrap (5 cases)'
