#!/usr/bin/env bash
# Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
# https://www.sinthetix.com
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONOREPO="$SCRIPT_DIR/../.."
source "$SCRIPT_DIR/../../../installation/ports.env"

echo "[gateway] Starting on http://localhost:${AGENCY_PORT_GATEWAY}"
cd "$MONOREPO"
exec pnpm --filter @agency/gateway dev
