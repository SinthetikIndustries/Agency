#!/usr/bin/env bash
# Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
# https://www.sinthetix.com
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONOREPO="$SCRIPT_DIR/../.."
cd "$MONOREPO"
nohup pnpm --filter @agency/gateway dev > /tmp/agency-gateway.log 2>&1 &
echo "[gateway] Started (PID $!) — logs at /tmp/agency-gateway.log"
