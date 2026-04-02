#!/usr/bin/env bash
# Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
# https://www.sinthetix.com
set -e

C_RESET='\033[0m'
C_GREEN='\033[0;32m'
C_YELLOW='\033[0;33m'
C_RED='\033[0;31m'
C_CYAN='\033[0;36m'

echo ""
echo -e "${C_CYAN}Agency — Prerequisites Check${C_RESET}"
echo ""

FAILED=0

# Node.js >= 22
if command -v node &>/dev/null; then
  NODE_VERSION=$(node -e "process.stdout.write(process.versions.node)")
  NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 22 ]; then
    echo -e "  ${C_GREEN}✓${C_RESET} Node.js ${NODE_VERSION}"
  else
    echo -e "  ${C_RED}✗${C_RESET} Node.js ${NODE_VERSION} (need >= 22 — https://nodejs.org/)"
    FAILED=1
  fi
else
  echo -e "  ${C_RED}✗${C_RESET} Node.js not found"
  echo -e "    Install via your distro's package manager or: ${C_CYAN}https://nodejs.org/${C_RESET}"
  FAILED=1
fi

# pnpm
if command -v pnpm &>/dev/null; then
  PNPM_VERSION=$(pnpm --version)
  echo -e "  ${C_GREEN}✓${C_RESET} pnpm ${PNPM_VERSION}"
else
  echo -e "  ${C_RED}✗${C_RESET} pnpm not found"
  echo -e "    Install: ${C_CYAN}npm install -g pnpm${C_RESET}"
  FAILED=1
fi

# Docker (installed + running)
if command -v docker &>/dev/null; then
  if docker info &>/dev/null 2>&1; then
    DOCKER_VERSION=$(docker --version | awk '{print $3}' | tr -d ',')
    echo -e "  ${C_GREEN}✓${C_RESET} Docker ${DOCKER_VERSION} (running)"
  else
    echo -e "  ${C_YELLOW}!${C_RESET} Docker installed but not running"
    echo -e "    Start the Docker daemon: ${C_CYAN}sudo systemctl start docker${C_RESET}"
    FAILED=1
  fi
else
  echo -e "  ${C_RED}✗${C_RESET} Docker not found"
  echo -e "    Install: ${C_CYAN}https://docs.docker.com/engine/install/${C_RESET}"
  FAILED=1
fi

echo ""

if [ "$FAILED" -eq 1 ]; then
  echo -e "${C_RED}Please fix the above issues before continuing.${C_RESET}"
  exit 1
fi

echo -e "${C_GREEN}All prerequisites met.${C_RESET} Next steps:"
echo ""
echo -e "  cd cli"
echo -e "  npm install"
echo -e "  npm run build"
echo -e "  npm install -g ."
echo -e "  agency install"
echo ""
