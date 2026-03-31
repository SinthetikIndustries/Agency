#!/usr/bin/env bash
# Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
# https://www.sinthetix.com

CONTAINER="agency-ollama"

if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" != "true" ]; then
  echo "[ollama] Not running."
  exit 0
fi

echo "[ollama] Stopping container..."
docker stop "$CONTAINER"
echo "[ollama] Stopped."
