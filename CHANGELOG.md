# Changelog

All notable changes to this project will be documented here.

Format: `[version] — date — description`

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
