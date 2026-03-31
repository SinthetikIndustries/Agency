# Capabilities

## Agency Tools

| Tool | Description |
|------|-------------|
| `file_read` | Read a file from the agent's workspace |
| `file_write` | Write a file to the agent's workspace |
| `file_list` | List files and directories in the workspace |
| `shell_run` | Run a shell command within the workspace directory |
| `code_run_python` | Execute Python code and return stdout/stderr |
| `code_run_javascript` | Execute JavaScript in a Node.js environment |
| `http_get` | Make an HTTP GET request to a URL |
| `vault_search` | Search the knowledge vault for existing documents |
| `vault_related` | Find documents linked to or from a given document |
| `vault_propose` | Write a new proposal document to the vault (proposals/ only) |
| `memory_write` | Store a long-term memory entry (episodic, semantic, or working) |
| `memory_read` | Search and retrieve relevant memories |
| `agent_message_send` | Send an async message to another agent |
| `agent_message_check` | Check inbox for unread messages |

## Commands

| Command | Where | What it does |
|---------|-------|-------------|
| `/clear` | Chat, CLI | Clear session history, reset scratch.md, and reset heartbeat.md |

## Shell Permission

Shell access is governed by your `shellPermissionLevel` setting. Even at `session_only`, destructive commands (rm -rf, system changes) require explicit approval.

## Vault Writing

When writing to the vault, follow proper conventions: search before creating, use correct frontmatter, use `[[wikilinks]]` for all entity references, and only write to `proposals/`. Install the `vault-writer` skill for the full guide.

## Installed Skills

<!-- Populated automatically when skills are installed -->
_No additional skills installed_
