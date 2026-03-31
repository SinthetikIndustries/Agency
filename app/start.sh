#!/usr/bin/env bash
# Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
# https://www.sinthetix.com

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../installation/ports.env"

C_RESET='\033[0m'
C_YELLOW='\033[0;33m'
C_CYAN='\033[0;36m'
C_MAGENTA='\033[0;35m'

prefix() {
  local color="$1"
  local label="$2"
  while IFS= read -r line; do
    echo -e "${color}[${label}]${C_RESET} ${line}"
  done
}

PIDS=()
cleanup() {
  trap - INT TERM EXIT HUP
  echo -e "\n${C_YELLOW}[agency] Shutting down...${C_RESET}"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null
  done
  wait 2>/dev/null
  echo -e "${C_YELLOW}[agency] Done.${C_RESET}"
  exit 0
}
trap cleanup INT TERM EXIT HUP

echo -e "${C_YELLOW}[agency] Starting services...${C_RESET}"
echo -e "${C_YELLOW}[agency]   Gateway   → http://localhost:${AGENCY_PORT_GATEWAY}${C_RESET}"
echo -e "${C_YELLOW}[agency]   Dashboard → http://localhost:${AGENCY_PORT_DASHBOARD}${C_RESET}"
echo ""

cd "$SCRIPT_DIR"

{ pnpm --filter @agency/gateway   dev 2>&1 | prefix "$C_CYAN"    "gateway";   } &
PIDS+=($!)
{ pnpm --filter @agency/dashboard dev 2>&1 | prefix "$C_MAGENTA" "dashboard"; } &
PIDS+=($!)

wait
