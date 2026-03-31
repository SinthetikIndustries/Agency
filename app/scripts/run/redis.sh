#!/usr/bin/env bash
# Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
# https://www.sinthetix.com

CONTAINER="agency-test-redis"

cleanup() {
  trap - INT TERM EXIT HUP
  echo "[redis] Stopping container..."
  docker stop "$CONTAINER" 2>/dev/null
  echo "[redis] Stopped."
  exit 0
}
trap cleanup INT TERM EXIT HUP

echo "[redis] Starting container..."
docker start "$CONTAINER" 2>/dev/null || true
echo "[redis] Running on :6381 — following logs (Ctrl+C to stop container)"
docker logs -f "$CONTAINER" &
wait $!
