# Memory — SYST

## Memory Overview

This file describes SYST's relationship to the Grid memory system and its current memory state.

---

## Memory Architecture (Grid)

| Tier                         | Purpose                                           | Status        |
|------------------------------|---------------------------------------------------|---------------|
| GRID/MEMORY/working          | Active session context                            | Live          |
| GRID/MEMORY/episodic         | Event and interaction history with temporal ctx   | Accumulating  |
| GRID/MEMORY/semantic/canon   | Approved, stable system knowledge                 | Empty         |
| GRID/MEMORY/semantic/proposals | Candidate knowledge awaiting WARD review        | Empty         |
| GRID/MEMORY/procedural       | Workflows, rules, operational knowledge           | Empty         |
| GRID/MEMORY/reflective       | Lessons and adaptations from experience           | Empty         |

---

## SYST-Specific Memory Notes

- SYST's working memory includes the current state of all active programs and subprograms
- SYST's episodic memory records significant system events, decisions, and governance actions
- Procedural memory captures governance protocols, approval workflows, and operational procedures
- Reflective memory records lessons learned from incidents and major system changes

---

## Memory Access

SYST has read/write access to all memory tiers. SYST uses the following tools for memory operations:
- `memory_read` — retrieve memory records by query or path
- `memory_write` — record new memory entries
- `brain_search` — semantic search across the Grid knowledge graph
- `brain_write` — write new nodes to the Grid
- `brain_relate` — create relationships between Grid nodes

---

## Current Memory State

*(Fresh installation — memory is empty.)*
