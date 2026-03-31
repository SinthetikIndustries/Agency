#!/usr/bin/env bash
# Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
# https://www.sinthetix.com
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

docker start agency-test-postgres agency-test-redis agency-ollama

bash "$SCRIPT_DIR/gateway.sh"
bash "$SCRIPT_DIR/dashboard.sh"
