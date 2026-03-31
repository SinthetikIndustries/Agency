#!/usr/bin/env bash
# Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
# https://www.sinthetix.com

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

C_RESET='\033[0m'
C_YELLOW='\033[0;33m'

echo -e "${C_YELLOW}[all] Stopping Agency services...${C_RESET}"

bash "$SCRIPT_DIR/gateway.sh"
bash "$SCRIPT_DIR/dashboard.sh"
bash "$SCRIPT_DIR/postgres.sh"
bash "$SCRIPT_DIR/redis.sh"
bash "$SCRIPT_DIR/ollama.sh"

echo -e "${C_YELLOW}[all] All services stopped.${C_RESET}"
