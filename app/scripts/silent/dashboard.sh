#!/usr/bin/env bash
# Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
# https://www.sinthetix.com
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONOREPO="$SCRIPT_DIR/../.."
cd "$MONOREPO"
nohup pnpm --filter @agency/dashboard dev > /tmp/agency-dashboard.log 2>&1 &
echo "[dashboard] Started (PID $!) — logs at /tmp/agency-dashboard.log"
