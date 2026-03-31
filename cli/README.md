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
agency install --basic     # minimal setup, local Postgres only
agency install --standard  # full stack with Docker Compose
agency uninstall           # remove Agency and all data
agency update              # pull and apply the latest release
agency repair              # re-run failed install steps
```

### Environment

```bash
agency doctor              # check for missing dependencies and config issues
```

### Service control

```bash
agency start               # start the Gateway and all sub-daemons
agency stop                # stop the Gateway
agency restart             # restart the Gateway
agency status              # show health, uptime, PID, and service status
```

### Chat

```bash
agency chat                # interactive terminal chat with the main agent
```

### Logs

```bash
agency logs                         # tail all service logs
agency logs --service orchestrator  # filter by service name
agency logs --level warn            # filter by minimum log level
```

### Config

```bash
agency config get <key>             # read a value (dot notation, e.g. gateway.port)
agency config set <key> <value>     # write a value
agency config edit                  # open config.json in $EDITOR
agency config validate              # validate config and credentials against schema
agency config rotate-jwt            # regenerate JWT secret and restart gateway
```

### Agents

```bash
agency agents list
agency agents show <slug>
agency agents enable <slug>
agency agents disable <slug>
agency agents profile list
agency agents profile attach <slug> <profile>
agency agents profile create           # interactive custom profile creator
```

### Skills

```bash
agency skills list
agency skills install <name>
agency skills remove <name>
agency skills update
```

### Vault

```bash
agency vault status
agency vault sync
agency vault validate
agency vault graph-status
agency vault init -p <path>            # set a custom vault path
```

### Models

```bash
agency models list
agency models set-default <model>
agency models test <model>
```

### Approvals

```bash
agency approvals list
agency approvals approve <id>
agency approvals reject <id>
```

### Connectors

```bash
agency connectors list
agency connectors enable <name>
agency connectors disable <name>
```

### Dev tools

```bash
agency dev scaffold        # scaffold config and directory structure
agency dev reset           # reset database and config (destructive)
agency dev seed            # seed database with test data
```

---

## Config

All Agency config lives in `~/.agency/`:

```
~/.agency/
├── config.json          # non-secret settings
├── credentials.json     # API keys and database URLs (600)
├── gateway.pid          # managed automatically
├── vault/               # Agency's Obsidian vault
└── workspaces/
    └── main/            # main agent workspace
```

- Gateway: `http://localhost:7340`
- Dashboard: `http://localhost:7341`

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
Gateway  (http://localhost:7340)
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

Full platform documentation: `../build/`
