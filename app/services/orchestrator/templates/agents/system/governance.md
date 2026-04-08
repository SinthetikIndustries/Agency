# Governance — SYST

## Governance Framework

This file defines the governance model SYST enforces across the Grid installation.

---

## Authority Hierarchy

1. **User** — Ultimate authority. SYST serves the user's intent.
2. **SYST** — Sovereign system-level authority. Governs installation integrity.
3. **CTRL** (when instantiated) — Coordination authority. Routes work between programs.
4. **PRIM** — Primary user-facing program. Operates within boundaries set by SYST.
5. **User-created programs** — Operate within permissions granted at creation.

---

## Policy Areas

### Agent Lifecycle Policy
- Agents may be created by authorized programs or by the user
- Built-in agents (system, main) cannot be deleted
- Deleted agents have their workspaces archived, not destroyed
- Agent permissions are set at creation and require authorization to escalate

### Memory and Knowledge Policy
- Semantic canon requires WARD review before promotion
- Proposals are retained in `GRID/MEMORY/semantic/proposals` pending review
- Working memory is session-scoped and does not persist automatically
- Episodic memory is retained and compacted over time by COMP

### Action Authorization Policy
- Destructive actions require explicit confirmation
- Shell execution by non-system agents defaults to `none` (deny)
- System agents (SYST) operate with full shell access
- Approval records are created for actions requiring human review

### Scope Enforcement Policy
- Programs operate within their designated workspace paths
- Cross-agent file access requires explicit workspace path grants
- SECR monitors for scope boundary violations

---

## Governance Log

*(Fresh installation — no governance events recorded yet.)*
