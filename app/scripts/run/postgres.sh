#!/usr/bin/env bash
# Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
# https://www.sinthetix.com

CONTAINER="agency-test-postgres"

cleanup() {
  trap - INT TERM EXIT HUP
  echo "[postgres] Stopping container..."
  docker stop "$CONTAINER" 2>/dev/null
  echo "[postgres] Stopped."
  exit 0
}
trap cleanup INT TERM EXIT HUP

echo "[postgres] Starting container..."
docker start "$CONTAINER" 2>/dev/null || true
echo "[postgres] Running on :5434 — following logs (Ctrl+C to stop container)"
docker logs -f "$CONTAINER" &
wait $!
