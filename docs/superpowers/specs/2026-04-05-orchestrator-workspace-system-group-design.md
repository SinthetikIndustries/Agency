# Orchestrator Workspace Labeling, Group Workspace Card & System Group

**Date:** 2026-04-05
**Status:** Approved

---

## Overview

Three related changes to the agent detail page and workspace model:

1. Lock the orchestrator agent's name and profile fields (read-only).
2. Classify and label workspace paths in the orchestrator's workspace card (primary / secondary with agent name pill / group workspace card).
3. Add a Group Workspaces card to every agent's detail page.
4. Introduce a system-wide group (`system`) created at install time that only the orchestrator can see.

---

## Section 1 — Orchestrator Page: Name & Profile Lock

On the agent detail page (`/dashboard/agents/orchestrator`), when `slug === 'orchestrator'`:

- **Name** — rendered as static text, not an `<input>`. The save button for the identity section is hidden.
- **Profile** — the profile switcher row is hidden entirely.

All other orchestrator fields (lifecycle, wake mode, shell permission, agent management) remain editable as today.

**Implementation:** Small conditional in the `OverviewTab` component using the existing `isBuiltIn` flag.

---

## Section 2 — New API Endpoint: `GET /agents/:slug/workspaces`

A new gateway route that returns classified workspace data for a given agent.

### Response shape

```json
{
  "primary": { "path": "/home/user/.agency/agents/orchestrator" },
  "secondary": [
    { "path": "/home/user/.agency/agents/aria", "agentName": "Aria", "agentSlug": "aria" }
  ],
  "groupWorkspaces": [
    {
      "path": "/home/user/.agency/shared/system/workspace",
      "groupId": "...",
      "groupName": "Agency System",
      "isSystemGroup": true
    },
    {
      "path": "/home/user/.agency/shared/research/workspace",
      "groupId": "...",
      "groupName": "Research",
      "isSystemGroup": false
    }
  ]
}
```

### Classification logic

1. `primary` — the agent's own `workspacePath`.
2. `secondary` — any path in `additional_workspace_paths` that matches another agent's primary `workspacePath`. Attach that agent's `name` and `slug`. Only populated for the orchestrator (other agents have no secondary workspaces).
3. `groupWorkspaces` — looked up from `workspace_groups` directly (not via path matching):
   - For **orchestrator**: all groups in the table, including the system group.
   - For **all other agents**: only groups where the agent has a row in `workspace_group_members`. The system group is excluded because no other agent is ever a member of it.
   - Each entry carries `groupId`, `groupName`, `isSystemGroup`, and `path`.

Paths in `additional_workspace_paths` that match neither an agent workspace nor a group workspace are omitted (should not occur in normal operation).

### Orchestrator workspace sync

The orchestrator service already syncs all agent workspace paths into `additional_workspace_paths` on `loadAgents()`. Additionally:

- `createAgent()` — add the new agent's `workspacePath` to orchestrator's `additional_workspace_paths` immediately after creation.
- `deleteAgent()` — remove the deleted agent's `workspacePath` from orchestrator's `additional_workspace_paths`.

This keeps the orchestrator's `additional_workspace_paths` current for tool access (file read/write). The `/workspaces` endpoint uses this data for secondary classification.

---

## Section 3 — Workspace Card UI Changes

### Orchestrator workspace card

| Row type | Badge | Controls |
|----------|-------|----------|
| Primary (own workspace) | `primary` (blue) | None |
| Secondary (agent workspace) | `secondary` (gray) + dynamic agent name pill | No remove button (locked) |

- The "Add workspace" input is hidden for the orchestrator — its workspaces are auto-managed.
- The agent name pill displays whatever `agentName` is returned by the `/workspaces` endpoint for that path.

### Other agents' workspace card

Unchanged from current behavior: primary path + additional paths with remove buttons + "Add workspace" input.

### Group Workspaces card (all agents)

A new card rendered below the Workspace card on every agent detail page.

**Orchestrator:**
- Lists all groups.
- System group row: group name (linked to `/dashboard/groups/:id`) + `primary group` badge (blue).
- All other group rows: group name (linked) + `tertiary` badge (gray).
- No remove controls — membership is managed from the Groups page.

**All other agents:**
- Lists only groups the agent is a member of.
- Each row: group name (linked to `/dashboard/groups/:id`) + `group workspace` badge.
- No remove controls.

If an agent has no group memberships, the card shows a subtle empty state ("No group workspaces").

---

## Section 4 — DB Schema & System Group Creation

### Migration 029

```sql
ALTER TABLE workspace_groups
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;
```

### System group

| Field | Value |
|-------|-------|
| Slug | `system` (well-known, fixed) |
| Name | `Agency System` |
| `is_system` | `true` |
| Workspace path | `~/.agency/shared/system/workspace` |
| Memory path | `~/.agency/shared/system/memory` |
| Members | None (no agent is ever a member) |

The system group workspace path is added to the orchestrator's `additional_workspace_paths` at install time so the orchestrator has file access to it.

### Install script placement

The system group is created **after** the user provides their personal assistant agent's name — near the end of the install sequence, after agents are provisioned. The install script inserts the group row into PostgreSQL and adds the workspace path to the orchestrator's `additional_workspace_paths`.

---

## Files Touched

| File | Change |
|------|--------|
| `app/apps/gateway/migrations/029_system_group.sql` | Add `is_system` column to `workspace_groups` |
| `app/apps/gateway/src/workspace-routes.ts` | New file — `GET /agents/:slug/workspaces` route |
| `app/apps/gateway/src/index.ts` | Register `workspace-routes` |
| `app/apps/dashboard/src/lib/api.ts` | Add `agents.workspaces(slug)` API call + types |
| `app/apps/dashboard/src/app/dashboard/agents/[slug]/page.tsx` | Lock name/profile for orchestrator; update WorkspaceSection; add GroupWorkspacesSection |
| `app/services/orchestrator/src/index.ts` | Sync orchestrator workspaces on `createAgent()` / `deleteAgent()` |
| `cli/src/commands/install.ts` | Create system group after agent provisioning |
