#!/usr/bin/env bash
set -euo pipefail

test "${RUNNER_ENVIRONMENT:-}" = github-hosted
test "$(uname -m)" = aarch64
test "$(git rev-parse HEAD)" = "$RELEASE_COMMIT"

case "${1:?choose game or tools}" in
  game)
    target=runtime
    package=strahovcrazyshow-game
    node scripts/check-lfs-assets.mjs
    git lfs fsck --objects
    # Remove duplicate LFS objects from this ephemeral runner after verification.
    # The checked-out files are the build context and stay in place.
    lfs_objects=$(realpath -e "$(git rev-parse --git-path lfs/objects)")
    test "$lfs_objects" = "$(pwd -P)/.git/lfs/objects"
    rm -rf -- "$lfs_objects"
    ;;
  tools)
    target=rag-tools
    package=strahovcrazyshow-rag-tools
    ;;
  *) exit 2 ;;
esac

df -h . /var/lib/docker
bash scripts/pi-deploy/release/assert-private.sh "$package"
printf '%s\n' "$GH_TOKEN" | docker login ghcr.io --username "$GITHUB_ACTOR" --password-stdin
metadata=$(mktemp)
builder="strahov-${1}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
docker buildx create --name "$builder" --driver docker-container
trap 'docker buildx rm "$builder"; rm -f -- "$metadata"' EXIT
docker buildx build --builder "$builder" --platform linux/arm64 --target "$target" \
  --build-arg SOURCE_DATE_EPOCH=0 --provenance=false --sbom=false \
  --label "org.opencontainers.image.source=https://github.com/$GITHUB_REPOSITORY" \
  --label "org.opencontainers.image.revision=$RELEASE_COMMIT" \
  --tag "ghcr.io/varnahg/$package:sha-$RELEASE_COMMIT" --metadata-file "$metadata" \
  --output type=image,push=true,compression=gzip,rewrite-timestamp=true .

digest=$(jq -er '.["containerimage.digest"] | select(test("^sha256:[a-f0-9]{64}$"))' "$metadata")
printf 'digest=%s\n' "$digest" >> "$GITHUB_OUTPUT"
