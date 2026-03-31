#!/usr/bin/env bash
# Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
# https://www.sinthetix.com

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONOREPO="$SCRIPT_DIR/../.."
REPO_ROOT="$SCRIPT_DIR/../../.."
source "$SCRIPT_DIR/../../../installation/ports.env"

# Colors
C_RESET='\033[0m'
C_YELLOW='\033[0;33m'
C_CYAN='\033[0;36m'
C_MAGENTA='\033[0;35m'
C_GREEN='\033[0;32m'
C_BLUE='\033[0;34m'
C_WHITE='\033[0;37m'

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
  echo -e "\n${C_YELLOW}[all] Shutting down...${C_RESET}"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null
  done
  wait 2>/dev/null
  echo -e "${C_YELLOW}[all] Stopping Docker containers...${C_RESET}"
  docker compose -f "$REPO_ROOT/installation/docker-compose.yml" stop 2>/dev/null
  echo -e "${C_YELLOW}[all] Done.${C_RESET}"
  exit 0
}
trap cleanup INT TERM EXIT HUP

echo -e "${C_YELLOW}[all] Starting Agency services...${C_RESET}"
echo -e "${C_YELLOW}[all]   Postgres  → localhost:${AGENCY_PORT_POSTGRES}${C_RESET}"
echo -e "${C_YELLOW}[all]   Redis     → localhost:${AGENCY_PORT_REDIS}${C_RESET}"
echo -e "${C_YELLOW}[all]   Ollama    → localhost:${AGENCY_PORT_OLLAMA}${C_RESET}"
echo -e "${C_YELLOW}[all]   Gateway   → http://localhost:${AGENCY_PORT_GATEWAY}${C_RESET}"
echo -e "${C_YELLOW}[all]   Dashboard → http://localhost:${AGENCY_PORT_DASHBOARD}${C_RESET}"
echo ""

# Start Docker containers (idempotent if already running)
docker compose -f "$REPO_ROOT/installation/docker-compose.yml" up -d 2>/dev/null || true

cd "$MONOREPO"

# Follow Docker logs with prefixes
{ docker logs -f agency-postgres 2>&1 | prefix "$C_BLUE"  "postgres"; } &
PIDS+=($!)
{ docker logs -f agency-redis    2>&1 | prefix "$C_GREEN" "redis"; } &
PIDS+=($!)
{ docker logs -f agency-ollama   2>&1 | prefix "$C_WHITE" "ollama"; } &
PIDS+=($!)

# Start node services
{ pnpm --filter @agency/gateway   dev 2>&1 | prefix "$C_CYAN"    "gateway"; } &
PIDS+=($!)
{ pnpm --filter @agency/dashboard dev 2>&1 | prefix "$C_MAGENTA" "dashboard"; } &
PIDS+=($!)

wait
