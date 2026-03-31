#!/usr/bin/env bash
# Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
# https://www.sinthetix.com

CONTAINER="agency-redis"

if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" != "true" ]; then
  echo "[redis] Not running."
  exit 0
fi

echo "[redis] Stopping container..."
docker stop "$CONTAINER"
echo "[redis] Stopped."
