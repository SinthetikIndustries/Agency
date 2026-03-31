#!/usr/bin/env bash
# Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
# https://www.sinthetix.com

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/../../.."
source "$SCRIPT_DIR/../../../installation/ports.env"

COMPOSE_FILE="$REPO_ROOT/installation/docker-compose.yml"
CONTAINER="agency-ollama"

cleanup() {
  trap - INT TERM EXIT HUP
  echo "[ollama] Stopping container..."
  docker compose -f "$COMPOSE_FILE" stop ollama 2>/dev/null
  echo "[ollama] Stopped."
  exit 0
}
trap cleanup INT TERM EXIT HUP

echo "[ollama] Starting container..."
docker compose -f "$COMPOSE_FILE" up -d ollama 2>/dev/null
echo "[ollama] Running on :${AGENCY_PORT_OLLAMA} — following logs (Ctrl+C to stop container)"
docker logs -f "$CONTAINER" &
wait $!
