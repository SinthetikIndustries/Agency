# Agency — User Guide

Agency is a personal AI platform that runs on your machine. It gives you a persistent AI assistant that can browse the web, run code, manage files, and connect to your tools — all controlled from a terminal or web dashboard.

---

## What's Running

| Service | URL | Purpose |
|---------|-----|---------|
| Gateway | `http://localhost:7340` | Core API and agent engine |
| Dashboard | `http://localhost:7341` | Web interface |

---

## Quick Start

### 1. Install

```bash
npm install -g .         # from the AgencyCLI directory
agency install --basic   # interactive setup
```

You'll be prompted for your API key (Anthropic or OpenAI) and a gateway API key is generated automatically.

### 2. Start

```bash
agency start
agency status   # confirm everything is healthy
```

### 3. Chat

Open the dashboard at `http://localhost:7341`, or use the terminal:

```bash
agency chat
```

---

## Core Commands

### Service control

```bash
agency start        # start the gateway
agency stop         # stop the gateway
agency restart      # restart the gateway
agency status       # show health, uptime, and service status
agency doctor       # check for missing dependencies or config issues
```

### Chat

```bash
agency chat         # open an interactive chat session with the main agent
```

### Config

```bash
agency config get <key>          # read a config value (dot notation)
agency config set <key> <value>  # write a config value
agency config edit               # open config.json in $EDITOR
agency config validate           # validate config against schema
agency config rotate-jwt         # regenerate JWT secret and restart
```

### Agents

```bash
agency agents list               # list all agents and their status
agency agents show <name>        # show agent details and current profile
agency agents enable <name>      # enable a dormant agent
agency agents disable <name>     # disable an agent
agency agents profile list       # list all available profiles
agency agents profile attach <agent> <profile>   # switch an agent's profile
agency agents profile create     # create a custom profile interactively
```

### Skills

```bash
agency skills list               # show installed skills
agency skills install <name>     # install a skill from the registry
agency skills remove <name>      # uninstall a skill
agency skills update             # update all installed skills
```

### Vault (Obsidian knowledge base)

```bash
agency vault status              # sync status, document count, error count
agency vault sync                # trigger a manual full sync
agency vault validate            # validate documents without syncing
agency vault graph-status        # entity graph stats (nodes, edges, links)
```

The vault lives at `~/.agency/vault/`. Open Obsidian and point it at that directory to browse and edit.

### Approvals

```bash
agency approvals list            # show pending approval requests
agency approvals approve <id>    # approve an action
agency approvals reject <id>     # reject an action
```

### Connectors

```bash
agency connectors list           # show connector status
agency connectors enable <name>  # enable a connector (discord, slack)
agency connectors disable <name> # disable a connector
```

### Logs

```bash
agency logs                      # tail gateway logs (all services)
agency logs --service gateway    # filter by service
agency logs --level error        # filter by log level
```

### Models

```bash
agency models list               # list available models and current default
agency models set-default <name> # change the default model
agency models test <name>        # send a test message to a model
```

### Updates

```bash
agency update                    # pull and apply latest release
agency repair                    # re-run failed install steps
```

---

## Configuration

Config is stored in `~/.agency/`:

| File | Contents | Permissions |
|------|----------|-------------|
| `config.json` | All non-secret settings | 644 |
| `credentials.json` | API keys | 600 |

Key settings:

```json
{
  "gateway": { "port": 7340 },
  "modelRouter": { "defaultModel": "gpt-4.1" },
  "daemons": {
    "vaultSync": { "enabled": true, "vaultPath": "~/.agency/vault" }
  }
}
```

Full schema: see `18_CONFIG_SCHEMA.md`.

---

## Vault and Obsidian

Agency creates and owns a vault at `~/.agency/vault/`. To connect Obsidian:

1. Open Obsidian → **Open folder as vault**
2. Select `~/.agency/vault/`
3. Install the **Dataview** and **Templater** plugins (recommended)

Agents write to `proposals/`. Promote content to `canon/` by moving files there. Agency re-syncs all changes automatically.

---

## Dashboard

Visit `http://localhost:7341` and log in with your gateway API key (found in `~/.agency/credentials.json` under `gateway.apiKey`).

Dashboard pages:
- **Overview** — health, uptime, service status
- **Chat** — real-time chat with agents via WebSocket
- **Agents** — manage agents and switch profiles
- **Skills** — install and remove skills
- **Vault** — sync status and document graph
- **Connectors** — Discord / Slack
- **Messaging** — inter-agent message queues
- **Logs** — live log stream with filtering
- **Approvals** — review and approve pending actions
- **Audit** — full action audit trail
- **Settings** — model, config, and connector settings

---

## Troubleshooting

```bash
agency doctor           # automated environment check
agency status           # confirm gateway is running
agency logs             # tail live logs
agency config validate  # check config for schema errors
```

If the gateway won't start, check `~/.agency/config.json` and `~/.agency/credentials.json` for missing or invalid values.
