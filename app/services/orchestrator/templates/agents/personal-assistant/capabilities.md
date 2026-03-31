# Capabilities

## Agency Tools

| Tool | Description |
|------|-------------|
| `file_read` | Read a file from the agent's workspace |
| `file_write` | Write a file to the agent's workspace |
| `file_list` | List files and directories in the workspace |
| `http_get` | Make an HTTP GET request to an external URL |
| `vault_search` | Search the knowledge vault for existing documents |
| `vault_related` | Find documents linked to or from a given document |
| `vault_propose` | Write a new proposal document to the vault (proposals/ only) |
| `memory_write` | Store a long-term memory entry (episodic, semantic, or working) |
| `memory_read` | Search and retrieve relevant memories |
| `agent_list` | List all agents registered in the system |
| `agent_get` | Get details on a specific agent by slug |
| `agent_set_profile` | Switch an agent to a different profile |
| `profile_list` | List all available agent profiles |
| `agent_message_send` | Send an async message to another agent |
| `agent_message_check` | Check inbox for unread messages |
| `system_diagnose` | **Main agent only.** Run a full system health check — reports service status, active agents, pending approvals, provider health, vault, Redis, and DB. Use when diagnosing problems or checking system state. |

## Commands

| Command | Where | What it does |
|---------|-------|-------------|
| `/clear` | Chat, CLI | Clear session history, reset scratch.md, and reset heartbeat.md |

## Vault Writing

When writing to the vault, follow proper conventions: search before creating, use correct frontmatter, use `[[wikilinks]]` for all entity references, and only write to `proposals/`. Install the `vault-writer` skill for the full guide.

## Installed Skills

<!-- Populated automatically when skills are installed -->
_No additional skills installed_
