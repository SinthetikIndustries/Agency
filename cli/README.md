# AgencyCLI

The command-line interface for the Agency platform.

AgencyCLI bootstraps the full stack before the platform exists, then acts as a service control tool and thin API client through the Gateway. The CLI contains no agent logic — it is a client.

---

## Install

```bash
npm install
npm run build
npm install -g .

agency --help
```

During development, run without building:

```bash
./bin/dev.js <command>
```

---

## Usage

```bash
agency <command> [subcommand] [args] [flags]
```

---

## Command Reference

### Bootstrap

```bash
agency install             # full setup (Docker Compose + all services)
agency uninstall           # remove Agency and all data
agency update              # pull and apply the latest release
agency repair              # re-run failed install steps
```

### Environment

```bash
agency doctor              # check for missing dependencies and config issues
agency health              # detailed health check for all services
agency metrics             # Prometheus metrics snapshot
agency status              # show health, uptime, PID, and service status
```

### Service control

```bash
agency start               # start the Gateway and all sub-daemons
agency stop                # stop the Gateway
agency restart             # restart the Gateway
```

### Authentication

```bash
agency auth login          # log in with an API key
agency auth logout         # log out
agency auth me             # show current identity
```

### Chat

```bash
agency chat                # interactive terminal chat with the main agent
```

### Logs

```bash
agency logs                         # tail all service logs
agency logs service <name>          # filter by service name
agency logs --level warn            # filter by minimum log level
```

### Config

```bash
agency config get <key>             # read a value (dot notation, e.g. gateway.port)
agency config set <key> <value>     # write a value
agency config edit                  # open config.json in $EDITOR
```

### Agents

```bash
agency agents list
agency agents create -n <name>
agency agents show <slug>
agency agents update <slug>
agency agents enable <slug>
agency agents disable <slug>
agency agents model-config <slug>
agency agents workspace get <slug>
agency agents workspace set <slug>
agency agents profile list
agency agents profile attach <slug> <profile>
agency agents profile create        # interactive custom profile creator
```

### Groups

```bash
agency groups list
agency groups create
agency groups members <id>
```

### Sessions

```bash
agency sessions list
agency sessions info <id>
agency sessions messages <id>
agency sessions send <id> <message>
agency sessions pin <id>
agency sessions unpin <id>
agency sessions rename <id> <name>
agency sessions delete <id>
```

### Models

```bash
agency models list
agency models pull <model>          # pull an Ollama model
agency models set-default <model>
agency models test <model>          # send a test prompt
```

### Skills

```bash
agency skills list
agency skills install <name>
agency skills remove <name>
agency skills update <name>
```

### Vault

```bash
agency vault status
agency vault sync
agency vault validate
agency vault graph-status
agency vault init
```

### Schedules

```bash
agency schedules list
agency schedules create
agency schedules delete <id>
agency schedules enable <id>
agency schedules disable <id>
agency schedules runs <id>
agency schedules stats
agency schedules workers
```

### MCP Servers

```bash
agency mcp connections
agency mcp reconnect <id>
```

### Messaging

```bash
agency messaging status
```

### Queue

```bash
agency queue workers
```

### Connectors

```bash
agency connectors list
agency connectors discord install
agency connectors discord enable
agency connectors discord disable
```

### Approvals

```bash
agency approvals list
agency approvals approve <id>
agency approvals reject <id>
```

### Audit

```bash
agency audit list
```

---

## Config

All Agency config lives in `~/.agency/`:

```
~/.agency/
├── config.json          # non-secret settings
├── credentials.json     # API keys and database URLs (600)
├── gateway.pid          # managed automatically
├── vault/               # Obsidian-compatible knowledge base
│   ├── canon/           # approved, human-reviewed notes
│   ├── proposals/       # agent-drafted notes pending review
│   ├── notes/           # general notes
│   └── templates/       # note templates
├── workspaces/          # per-agent private workspaces
└── shared/              # shared group workspaces
```

- Gateway: `http://localhost:2002`
- Dashboard: `http://localhost:2001`

---

## Tech stack

| Concern | Choice |
|---------|--------|
| Language | TypeScript |
| Runtime | Node.js LTS |
| CLI framework | oclif |
| Terminal color | chalk |
| Spinners | ora |
| Prompts | @inquirer/prompts |
| Config validation | zod |
| Subprocess | execa |

---

## Architecture

```
User
  ↓
AgencyCLI  (install · manage · chat)
  ↓
Gateway  (http://localhost:2002)
  ├── Orchestrator
  ├── Model Router  (OpenAI · Anthropic · Ollama)
  ├── Tool Registry
  ├── Vault Sync    (watches ~/.agency/vault/)
  └── Worker Queue  (Redis + BullMQ)
       ├── shell-worker
       ├── browser-worker
       ├── code-worker
       ├── planner-worker
       └── ingestion-worker
```

Full platform documentation: see the [main README](../README.md).
