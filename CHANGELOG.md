# Changelog

All notable changes to this project will be documented here.

Format: `[version] — date — description`

---

## [0.3.0] — 2026-04-05

### Added
- **Orchestrator / PA split** — Two protected built-in agents: Orchestrator (full autonomy) and Main (personal assistant with approval gates). Each has its own workspace, memory, and permission profile.
- **Workspace groups** — Organize agents into named groups with shared workspaces and group-level memory. Agents in a group see group context alongside their own.
- **Canvas views** — Interactive ReactFlow canvases: per-agent capability map, group topology, and full-system Network map.
- **Agent Architect** — Describe an agent in plain language; Agency generates a complete spec (name, slug, system prompt, tools, permissions) via LLM. One click to accept and create.
- **Per-agent permissions** — Fine-grained `AgencyPermissions`: `agentCreate`, `agentDelete`, `agentUpdate`, `groupCreate`, `groupUpdate`, `groupDelete`, `shellRun` each independently set to `deny`, `request`, or `autonomous`. Plus per-agent allow/deny rule lists.
- **Tool registry** — Typed tool browser in the dashboard. Browse all agent tools by category: file, shell, browser, HTTP, code, memory, vault, messaging, agent management.
- **Event hooks** — Register shell commands that fire on platform events (session, agent, tool, approval, and more). Blocking hooks can gate events before they proceed.
- **Messaging system** — Structured inbound message queues per agent with priority, expiry, and delivery tracking. Dashboard shows inbox depths and recent message history.
- **Scheduled tasks** — Cron-style job scheduling per agent. Create, enable/disable, and inspect run history from the dashboard or CLI.
- **MCP server support** — Connect to external MCP servers via stdio or HTTP/SSE. Tools from connected servers are automatically available to agents. Manage connections and reconnects from the dashboard or CLI.
- **Session management CLI** — `agency sessions list/info/messages/send/pin/unpin/rename/delete`
- **Model management CLI** — `agency models list/pull/set-default/test`
- **Auth CLI** — `agency auth login/logout/me`
- **Config CLI** — `agency config get/set/edit`
- **Approvals CLI** — `agency approvals list/approve/reject`
- **Audit CLI** — `agency audit list`
- **Schedules CLI** — `agency schedules list/create/delete/enable/disable/runs/stats/workers`
- **MCP CLI** — `agency mcp connections/reconnect`
- **Queue CLI** — `agency queue workers`
- **Background worker fleet** — shell, browser, code, planner, and ingestion workers with queue monitoring.
- **Dashboard expanded to 16 pages** — added Tools, Hooks, Messaging, Schedules, MCP Servers.

---

## [0.2.1 / CLI 0.1.1] — 2026-03-30

### Added
- **Ollama in Docker** — Ollama now runs as a Docker-managed service (port 2005) alongside Postgres and Redis. No separate container management needed.
- **Auto model pull** — `agency install` automatically pulls `qwen3:8b` into Ollama with a readiness check before pulling (up to 30s wait).
- **Unified port constants** — All port numbers consolidated into single-source constants files: `app/packages/config/src/ports.ts`, `cli/src/lib/ports.ts`, `app/apps/dashboard/src/lib/ports.ts`, and `installation/ports.env` for shell scripts.

### Changed
- **Port range migrated to 2001–2005** — All services moved to non-standard ports to avoid conflicts with existing local services:
  - Dashboard: 7341 → 2001
  - Gateway: 7340 → 2002
  - PostgreSQL: 5432 → 2003 (host mapping)
  - Redis: 6379 → 2004 (host mapping)
  - Ollama: 11434 → 2005 (host mapping)
- **Docker container names standardized** — `agency-postgres`, `agency-redis`, `agency-ollama` (explicit `container_name` in compose).
- **Ollama enabled by default** in generated config (`modelRouter.providers.ollama.enabled: true`, endpoint `http://localhost:2005`).
- **Linux compatibility broadened** — README and `installation/install.sh` now support Ubuntu, Debian, Fedora, Arch, and other modern distros (not Ubuntu-only).
- **Stop scripts use `ss` instead of `lsof`** — `iproute2`'s `ss` is present on all modern Linux distros; `lsof` is not.
- **Shell scripts source `installation/ports.env`** — No hardcoded port numbers in any script.
- **Install step 3 updated** — Installer now starts PostgreSQL, Redis, and Ollama (not just Postgres + Redis).

### Fixed
- `app/scripts/run/ollama.sh` now starts Ollama via `docker compose up` instead of `docker start` (works on fresh installs where the container doesn't yet exist).
- `app/scripts/run/all.sh` container names updated from `agency-test-*` to `agency-*`.

---

## [0.2.0 / CLI 0.1.0] — 2026-03-29

Initial GitHub release.

- Gateway + WebSocket streaming
- Multi-agent orchestration (main + Researcher, Coder, Writer)
- Model routing — Anthropic, OpenAI, Ollama
- Vault sync — Markdown → PostgreSQL + pgvector
- Dashboard — 10 pages (overview, chat, agents, skills, vault, connectors, logs, approvals, audit, settings)
- Discord connector
- Skills + profiles
- Audit log + human-in-the-loop approvals
- CLI — install, start, stop, status, doctor, update, uninstall, agents, chat, vault
