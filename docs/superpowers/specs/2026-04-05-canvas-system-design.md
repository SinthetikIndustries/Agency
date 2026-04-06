# Agency Canvas System Design

**Date:** 2026-04-05
**Status:** Approved
**Scope:** `app/apps/dashboard/src/components/canvas/`, `app/apps/dashboard/src/app/dashboard/groups/`, `app/apps/dashboard/src/app/dashboard/network/`, `app/apps/dashboard/src/app/dashboard/agents/[slug]/`

---

## Overview

A fully functional alternative input layer for managing the Agency system visually. Users who prefer graphical manipulation can do everything from the canvas — create groups, add/remove members, configure agents, attach skills, manage workspaces — without touching the dashboard forms and tables. Users who prefer list/form UI are unaffected; list views remain the default.

Three canvas surfaces, each purpose-built for its context, sharing one node design system and interaction library.

---

## Current State

- `GroupsCanvas.tsx` — stub: flat node layout, no parent/child nesting, no edges, no context menus, no drag-drop API calls
- `node-types.tsx` — 5 basic card nodes (GroupNode, AgentNode, SkillNode, ToolNode, WorkspaceNode), minimal styling
- `canvas-toolbar.tsx` — edit toggle + fit-view button only
- Network map page (`/dashboard/network`) — no canvas content yet
- Agent canvas tab — route exists, no canvas content

---

## 1. Shared Canvas Component Library

All canvas components live under `app/apps/dashboard/src/components/canvas/`.

### 1a. Node Design System

Every node follows the same anatomy:
- **Header strip**: icon + name + status dot (where applicable)
- **Body**: key info specific to node type
- **Handles**: source and/or target, positioned by node type

All nodes respond identically to:
- **Click** → opens `CanvasSidePanel`
- **Right-click** → opens `CanvasContextMenu`
- **Hover** → `NodeToolbar` floats above with 2–3 quick actions

**Node types:**

| Node | Export name | Visual | Header | Body |
|---|---|---|---|---|
| Group container | `GroupNode` | Blue border, dark bg, resizable | Group icon + name + hierarchy badge | Member count, top 2 goals, workspace path |
| Agent | `AgentNode` | Green (active) / Gray (inactive) / Purple (orchestrator) border | Initial avatar + name + live status dot | Slug, current profile |
| Orchestrator | `OrchestratorNode` | Purple, larger, crown icon | "System" label | Version, uptime |
| Skill | `SkillNode` | Teal border | Skill icon + name | Version |
| Tool | `ToolNode` | Slate border | Tool icon + name | Permission level badge |
| Workspace | `WorkspaceNode` | Amber border | Folder icon + label | Truncated path |

`GroupNode` uses ReactFlow's parent-node pattern: `type: 'group'`, `style: { width, height }`, with `<NodeResizer>` embedded. Agent nodes inside a group have `parentId: groupNodeId` and `extent: 'parent'`.

`NODE_TYPES` map exported from `node-types.tsx` is updated to include all types.

### 1b. CanvasSidePanel

A slide-in right panel rendered outside ReactFlow (positioned fixed, z-indexed above canvas). Content is swapped per node type via a `panelType` discriminated union.

```typescript
type SidePanelContent =
  | { type: 'group'; groupId: string }
  | { type: 'agent'; slug: string }
  | { type: 'skill'; skillId: string }
  | { type: 'tool'; toolName: string; agentSlug: string }
  | { type: 'workspace'; path: string; agentSlug?: string }
```

Panel per type:
- **Group**: name/description/goals inline editor, member list with add/remove dropdown, hierarchy type selector, delete button (with confirmation)
- **Agent**: profile switcher, model tier display, permissions display, autonomous mode toggle, workspace paths list — full parity with agent settings page
- **Skill**: name, description, version, trigger, attach/detach button
- **Tool**: permission level dropdown, enable/disable toggle, last-called timestamp + 24h call count
- **Workspace**: inline file tree (reuses existing Workspace tab component)

Panel opens by calling `openPanel(content)` from node `onClick` handlers. `ESC` or clicking outside closes it.

### 1c. CanvasContextMenu

Positioned absolutely over the canvas using `onNodeContextMenu` / `onEdgeContextMenu` / `onPaneContextMenu`. Dismissed on `onPaneClick` or selecting an action.

Menu items per context:

**GroupNode right-click:**
- Add Member
- Edit (opens side panel)
- Delete Group

**AgentNode right-click:**
- View / Edit Agent (opens side panel)
- Open Agent Canvas (navigates to agent canvas tab)
- Add to Group (submenu: list of groups)
- Remove from Group (if inside a group)
- Invoke Agent

**SkillNode right-click:**
- View Detail
- Detach from Agent
- Open Skills Page

**ToolNode right-click:**
- View Permissions
- Enable / Disable for this agent
- View Recent Calls

**WorkspaceNode right-click:**
- Open File Tree (opens side panel)
- Add Workspace Path
- Remove from Agent

**Empty pane right-click:**
- New Group
- New Agent

### 1d. CanvasToolbar (updated)

Existing toolbar gains:
- **Edit Mode toggle** (already exists) — when OFF, drag-drop is disabled but click/right-click still work
- **Fit View** (already exists)
- **Layout Reset** button — re-runs auto-layout, discards saved positions
- **Live Mode toggle** (Network map and Agent canvas only) — animates invoke edges from audit_log
- **Add Group / Add Agent** buttons (context-dependent)

### 1e. Layout Utilities

`canvas-layout.ts` — wraps Dagre (already in reactflow ecosystem) to auto-position nodes.

```typescript
export function computeGroupsLayout(groups: WorkspaceGroup[], agents: Agent[]): { nodes: Node[], edges: Edge[] }
export function computeNetworkLayout(agents: Agent[], groups: WorkspaceGroup[]): { nodes: Node[], edges: Edge[] }
export function computeAgentLayout(agent: Agent, skills: Skill[], tools: Tool[], workspaces: string[]): { nodes: Node[], edges: Edge[] }
```

Each function returns fully computed nodes (with positions) and edges. The canvas components call these on first load. After first render, node positions are saved to `localStorage` keyed by `canvas-positions-{surfaceId}`. "Reset Layout" clears localStorage and re-calls the layout function.

---

## 2. Edge Types

Edges use ReactFlow's built-in edge system with custom `type` and `style` props.

| Edge type | Style | Meaning | Surfaces |
|---|---|---|---|
| `membership` | Solid, colored per group | Agent belongs to group | Groups, Network |
| `invoke` | Dashed, animated when live mode on | Agent invoked another (from audit_log) | Network, Agent |
| `workspace` | Dotted | Agent has group workspace path | Groups, Network |
| `skill-attach` | Solid thin | Agent → skill | Agent canvas |
| `tool-attach` | Solid thin | Skill → tool it uses | Agent canvas |

Edge animation uses ReactFlow's `animated: true` prop, toggled by live mode state.

---

## 3. Groups Canvas

**Route:** `/dashboard/groups` — toggle between List view and Canvas view at top of page (already exists in design).

### Layout

On load: `computeGroupsLayout()` produces parent group nodes with agents nested inside using `parentId`. Unassigned agents appear in a row below all groups with a subtle "Unassigned" label.

Group container dimensions are computed from member count (minimum 240×180, grows with members). User can resize via `NodeResizer`.

### Drag-Drop (edit mode only)

- Drag `AgentNode` into `GroupNode` container → fires `POST /groups/:id/members` with `{ agentId }` → on success, updates node's `parentId` and `extent`
- Drag `AgentNode` out of container → fires `DELETE /groups/:id/members/:agentId` → on success, removes `parentId`
- Changes persist on drop, no save button

### Inline Group Creation

Right-click empty pane → "New Group" → small inline form node appears at click coordinates (name + hierarchy type fields, confirm/cancel). On confirm: `POST /groups` → new `GroupNode` added to canvas at that position.

---

## 4. Network Map

**Route:** `/dashboard/network` — canvas-only, no list equivalent.

### Layout

`computeNetworkLayout()` using Dagre with top-down direction. `OrchestratorNode` is pinned at top-center (fixed position, `draggable: false`). Groups are mid-tier. Unassigned agents at bottom.

### Live Mode

When Live Mode is toggled on:
- Poll `GET /audit-log?limit=100&since=24h` every 30s
- Edges between agents that have invoked each other get `animated: true`
- Active agent nodes (have a session in last 10 min) get a pulsing green border via CSS animation
- Edge thickness scales with invoke frequency (1–3px)

### Content

Shows: all agents (with `OrchestratorNode` for the orchestrator), all groups (as container nodes with member agents), all workspace connections (dotted edges), and invoke relationships (dashed animated edges).

---

## 5. Agent Canvas Tab

**Route:** `/dashboard/agents/[slug]` — new "Canvas" tab alongside existing tabs.

### Layout

`computeAgentLayout()` produces a radial layout:
- Agent node at center
- Skills arc (top-left)
- Tools arc (top-right)
- Workspace nodes arc (bottom)
- Edges: agent→skill, skill→tools it uses, agent→workspace

### Live Activity Overlay

Toggle button in toolbar. When on:
- Poll `GET /audit-log?agentId=:slug&limit=200&since=24h` every 30s
- Edges for tools/skills called recently animate (`animated: true`)
- Hover an animated edge → tooltip: "Last called: 2h ago · 14 calls today"

### Workspace Node

Click → `CanvasSidePanel` opens with `type: 'workspace'` content — inline file tree. File/folder click → content preview pane within the panel.

---

## 6. Data Flow

Each canvas surface is a client component that receives data as props from its parent server component (same pattern as the rest of the dashboard):

```
Server component (page.tsx)
  → fetches groups, agents, sessions, audit entries via API
  → passes as props to canvas client component
  → canvas component runs layout, renders ReactFlow
```

Canvas mutations call the existing gateway API directly (same endpoints the list views use). On success, update local ReactFlow node/edge state via `setNodes` / `setEdges` — no full page reload.

---

## 7. Implementation Order

### Phase 1 — Foundation
1. Update `node-types.tsx`: apply full node design system (icons, status dots, n8n-quality styling) for all 6 node types. Add `OrchestratorNode`. Update `NODE_TYPES` map.
2. Create `canvas-layout.ts`: Dagre-based layout functions for all three surfaces. localStorage position persistence.
3. Update `canvas-toolbar.tsx`: add Layout Reset, Live Mode toggle, Add Group/Agent buttons.

### Phase 2 — Side Panel & Context Menu
4. Create `CanvasSidePanel.tsx`: slide-in panel with content variants for all node types. Wire all panel content to existing API client methods.
5. Create `CanvasContextMenu.tsx`: positioned context menu for node/edge/pane right-click. All action handlers call API, then update canvas state.

### Phase 3 — Groups Canvas
6. Rebuild `GroupsCanvas.tsx`: parent/child layout with `NodeResizer`, drag-drop membership API calls, inline group creation on pane right-click, edge rendering (membership + workspace).

### Phase 4 — Network Map
7. Build `NetworkCanvas.tsx` in `/dashboard/network/`. Full system view with OrchestratorNode pinned, Dagre layout, Live Mode polling + animated edges.
8. Update `network/page.tsx` to fetch all data and pass to `NetworkCanvas`.

### Phase 5 — Agent Canvas Tab
9. Build `AgentCanvas.tsx` in `/dashboard/agents/[slug]/`. Radial layout, live activity overlay, workspace node side panel.
10. Add "Canvas" tab to agent detail page layout.

---

## 8. Unchanged

- All existing list views, forms, modals — no changes
- API endpoints — no new endpoints needed; canvas uses all existing ones
- Dashboard nav, auth, sessions, chat — no changes
- Gateway, orchestrator, CLI — no changes
