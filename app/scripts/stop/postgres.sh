#!/usr/bin/env bash
# Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
# https://www.sinthetix.com

CONTAINER="agency-postgres"

if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" != "true" ]; then
  echo "[postgres] Not running."
  exit 0
fi

echo "[postgres] Stopping container..."
docker stop "$CONTAINER"
echo "[postgres] Stopped."
