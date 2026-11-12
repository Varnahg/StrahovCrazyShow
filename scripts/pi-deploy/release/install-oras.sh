#!/usr/bin/env bash
set -euo pipefail

case "$(uname -m)" in
  x86_64) arch=amd64; sha=6cdc692f929100feb08aa8de584d02f7bcc30ec7d88bc2adc2054d782db57c64 ;;
  aarch64) arch=arm64; sha=7649738b48fde10542bcc8b0e9b460ba83936c75fb5be01ee6d4443764a14352 ;;
  *) exit 2 ;;
esac
target="${RUNNER_TEMP:?}/strahov-oras"
mkdir -p "$target"
archive=$(mktemp)
trap 'rm -f -- "$archive"' EXIT
curl --fail --silent --show-error --location --max-time 60 \
  "https://github.com/oras-project/oras/releases/download/v1.3.0/oras_1.3.0_linux_${arch}.tar.gz" \
  --output "$archive"
printf '%s  %s\n' "$sha" "$archive" | sha256sum --check --strict
tar -xzf "$archive" -C "$target" oras
printf '%s\n' "$target" >> "${GITHUB_PATH:?}"
