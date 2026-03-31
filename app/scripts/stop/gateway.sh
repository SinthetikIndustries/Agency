#!/usr/bin/env bash
# Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
# https://www.sinthetix.com

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../../installation/ports.env"

PORT=$AGENCY_PORT_GATEWAY

get_pids_on_port() {
  ss -tlnp "sport = :$1" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2
}

PIDS=$(get_pids_on_port "$PORT")

if [ -z "$PIDS" ]; then
  echo "[gateway] Not running on :$PORT"
  exit 0
fi

echo "[gateway] Stopping (port $PORT, PID $PIDS)..."
echo "$PIDS" | xargs kill 2>/dev/null
sleep 1

REMAINING=$(get_pids_on_port "$PORT")
if [ -n "$REMAINING" ]; then
  echo "$REMAINING" | xargs kill -9 2>/dev/null
fi

echo "[gateway] Stopped."
