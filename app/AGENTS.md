# Agency — Agentic Development Guide

## Project Overview

Agency is a self-hostable AI agent platform. It runs a local gateway (Fastify), a dashboard (Next.js), an orchestrator, a model router, vault sync, and a tool registry as a pnpm monorepo.

## Monorepo Structure

```
apps/
  dashboard/       Next.js 16 frontend (port 7341)
  gateway/         Fastify API + WebSocket server (port 7340)
services/
  orchestrator/    Agent runtime, profile/session management
  model-router/    LLM provider routing (Anthropic, OpenAI, Ollama)
  vault-sync/      Obsidian vault watcher → Postgres
  shared-worker/   BullMQ queue client
packages/
  tool-registry/   Tool definitions and execution
  config/          Shared config loader
  shared-types/    Cross-package TypeScript types
  memory/          pgvector memory store
  messaging/       Inter-agent messaging
AgencyCLI/         CLI (oclif)
docs/
  superpowers/
    specs/         Design specs
    plans/         Implementation plans
build/             Architecture docs and build phase plans
```

## Key Commands

```bash
# Install (from monorepo root)
pnpm install

# Build all packages
pnpm build

# Dev mode
cd apps/gateway && pnpm start         # gateway on :7340
cd apps/dashboard && pnpm dev         # dashboard on :7341

# Tests
pnpm test                             # run all tests
cd apps/gateway && pnpm vitest run    # gateway unit tests only

# CLI (test build)
node /home/sinthetix/Desktop/Agency/Agency\ Test/AgencyCLI/bin/run.js
```

## Test Environment

- **Test build:** `/home/sinthetix/Desktop/Agency/Agency Test/Agency/`
- **Main build:** `/home/sinthetix/Desktop/Agency/Agency/`
- Postgres: port 5434 (Docker), Redis: port 6381 (Docker)
- API key for test login: `agency-test-api-key-123`
- Config: `~/.agency/config.json`, credentials: `~/.agency/credentials.json`

## Agent Runtime Files

Each agent has a `config/` directory with these files (injected in order):

| File | Purpose |
|------|---------|
| `identity.md` | Name, role, responsibilities |
| `soul.md` | Personality, values, communication style |
| `user.md` | What the agent knows about the user |
| `heartbeat.md` | Session task tracker (reset each session) |
| `capabilities.md` | Available tools, commands, skills reference |
| `scratch.md` | Ephemeral working notes (cleared on `/clear`) |

Profile templates live at `services/orchestrator/templates/agents/`.
Runtime agent files live at `~/.agency/agents/{slug}/config/`.

## Architecture Notes

- **Auth:** JWT cookie sessions, `agency_api_key` stored in localStorage, silent re-auth on 401
- **WebSocket:** `ws://localhost:7340/sessions/{id}?token={apiKey}` — cross-origin requires `?token=` param (SameSite=Lax cookie doesn't cross ports)
- **Profiles:** 6 built-in (default, developer, researcher, analyst, executive, personal-assistant) — main agent profile is locked, sub-agents only
- **Vault:** `~/.agency/vault/` — canon/ (approved), proposals/ (agent drafts), notes/, templates/
- **Models:** default `gpt-4.1`, tiers: cheap=`gpt-4.1-mini`, strong=`gpt-4.1`
- **Tag parser:** Gateway strips `<artifact>`, `<file_diff>`, `<shell_output>`, `<file_tree>`, `<web_preview>`, `<plan>` tags from streamed text and emits typed WS events

## What Not To Touch

- `~/.agency/credentials.json` — contains live API keys
- `apps/gateway/src/migrate.ts` — migration runner, edit SQL files instead
- `services/orchestrator/templates/agents/main/` — main agent profile is locked by design
- The `exp: 0` JWT behavior in `jwt-auth.ts` — intentional indefinite sessions

## Testing Conventions

- Dashboard has **no test setup** — no jest/vitest installed
- Gateway uses Vitest — test files alongside source (`*.test.ts`)
- After modifying gateway, always run `pnpm build` in `apps/gateway` to catch TypeScript errors
- After modifying dashboard, run `pnpm build` in `apps/dashboard` to catch errors

## Sync Policy

All changes tested in `Agency Test/Agency/` get copied to `Agency/` (main build) after tests pass. Build docs in `build/` track phase completion.
