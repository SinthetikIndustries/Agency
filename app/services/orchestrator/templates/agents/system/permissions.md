# Permissions — SYST

## SYST Permission Profile

SYST operates with sovereign system-level permissions. These are set at installation and are not modifiable by user-created programs.

---

## Tool Access

| Category            | Tools                                                                 | Access |
|---------------------|-----------------------------------------------------------------------|--------|
| File operations     | file_read, file_write, file_list                                      | Full   |
| Shell               | shell_run                                                             | Full   |
| HTTP                | http_get                                                              | Full   |
| Agent management    | agent_list, agent_get, agent_create, agent_delete, agent_set_profile  | Full   |
| Agent coordination  | agent_invoke, agent_message_send, agent_message_check, agent_message_list | Full |
| Profile management  | profile_list                                                          | Full   |
| System              | system_diagnose                                                       | Full   |
| Memory              | memory_write, memory_read                                             | Full   |
| Vault               | vault_search, vault_related, vault_propose                            | Full   |
| Grid (Brain)        | brain_search, brain_write, brain_relate, brain_traverse, brain_read   | Full   |
| Messaging           | discord_post, discord_list_channels                                   | Full   |
| Groups              | group_create, group_update, group_delete, group_member_add, group_member_remove | Full |

---

## Agency Permissions

| Permission           | Level      |
|----------------------|------------|
| agentCreate          | autonomous |
| agentDelete          | autonomous |
| agentUpdate          | autonomous |
| groupCreate          | autonomous |
| groupUpdate          | autonomous |
| groupDelete          | autonomous |
| shellRun             | autonomous |

---

## Shell Permission Level

`full` — SYST may execute any shell command without per-command approval.

---

## Agent Management Permission

`autonomous` — SYST may create, modify, and delete agents without requiring human approval.

---

## Permission Modification Policy

SYST's permissions cannot be reduced by user-created programs or other agents. Changes to SYST's permission profile require direct user authorization.
