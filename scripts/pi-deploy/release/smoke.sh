#!/usr/bin/env bash
set -euo pipefail

test "$(uname -m)" = aarch64
test "$(git rev-parse HEAD)" = "$RELEASE_COMMIT"
tmp=$(mktemp -d)
project="strahov-arm-smoke-${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
dc=(docker compose --project-name "$project" -f compose.full.yaml -f "$tmp/images.yaml")
cleanup() {
  status=$?
  trap - EXIT
  if (( status != 0 )); then "${dc[@]}" logs --tail 40 game rag-bootstrap || true; fi
  "${dc[@]}" down --volumes --remove-orphans || status=1
  rm -f -- "$tmp/images.yaml" "$tmp/smoke-key.txt"
  rmdir -- "$tmp"
  exit "$status"
}
trap cleanup EXIT

export SMOKE_GAME_REF="ghcr.io/varnahg/strahovcrazyshow-game@${RELEASE_GAME_DIGEST:?}"
export SMOKE_TOOLS_REF="ghcr.io/varnahg/strahovcrazyshow-rag-tools@${RELEASE_TOOLS_DIGEST:?}"
export SMOKE_DB_REF="docker.io/pgvector/pgvector@sha256:215ae4d47393a980e9ef7ff7760f7dad53ec3e84bceb9fbd45cef34e50b5ba0f"
export OPENAI_SECRET_FILE="$tmp/smoke-key.txt" HTTP_PORT=18081 BIND_ADDRESS=127.0.0.1
export RAG_BOOTSTRAP_MAX_INPUTS=0 RAG_BOOTSTRAP_MAX_BYTES=0
export STRAHOV_TEST_URL=http://127.0.0.1:18081
printf '%s\n' 'docker-runtime-smoke-fixture' > "$OPENAI_SECRET_FILE"
chmod 0444 "$OPENAI_SECRET_FILE"
cat > "$tmp/images.yaml" <<'YAML'
services:
  rag-secrets:
    image: ${SMOKE_TOOLS_REF:?}
  rag-db:
    image: ${SMOKE_DB_REF:?}
  rag-bootstrap:
    image: ${SMOKE_TOOLS_REF:?}
  game:
    image: ${SMOKE_GAME_REF:?}
    environment:
      STRAHOV_AUTH_MODE: local
      STRAHOV_LOCAL_TEST_ONLY: "1"
YAML

df -h . /var/lib/docker
printf '%s\n' "$GH_TOKEN" | docker login ghcr.io --username "$GITHUB_ACTOR" --password-stdin
for ref in "$SMOKE_GAME_REF" "$SMOKE_TOOLS_REF" "$SMOKE_DB_REF"; do
  docker pull --platform linux/arm64 "$ref"
  test "$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$ref")" = linux/arm64
done
for ref in "$SMOKE_GAME_REF" "$SMOKE_TOOLS_REF"; do
  test "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$ref")" = "$RELEASE_COMMIT"
done

"${dc[@]}" up -d --no-build --pull never --wait --wait-timeout 180
check_container_image() {
  container=$("${dc[@]}" ps -aq "$1")
  test -n "$container"
  test "$(docker inspect --format '{{.Image}}' "$container")" = "$(docker image inspect --format '{{.Id}}' "$2")"
}
check_container_image rag-secrets "$SMOKE_TOOLS_REF"
check_container_image rag-db "$SMOKE_DB_REF"
check_container_image rag-bootstrap "$SMOKE_TOOLS_REF"
check_container_image game "$SMOKE_GAME_REF"
curl --fail --silent --show-error --max-time 10 "$STRAHOV_TEST_URL/api/ai/status" | jq -e '.enabled == true'
node --import tsx scripts/integration-docker.ts
STRAHOV_AUTH_TEST_DIR="$tmp" node --import tsx scripts/integration-google-auth.ts
