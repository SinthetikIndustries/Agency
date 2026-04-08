# History — SYST

## History Overview

This file tracks SYST's interaction with the Grid history system.

---

## History Architecture (Grid)

| Path                       | Contents                                              |
|----------------------------|-------------------------------------------------------|
| GRID/HISTORY/events        | System events recorded by SENS                        |
| GRID/HISTORY/decisions     | Major rulings and outcomes from SYST and programs     |
| GRID/HISTORY/approvals     | Approval requests, resolutions, and audit records     |

---

## SYST History Scope

SYST records history entries for:
- System initialization and bootstrap events
- Governance decisions and policy changes
- Agent creation and deletion
- Approval resolutions (approved, rejected, timed out)
- Subprogram health events
- Major memory operations (canon promotions, purges)
- Coordination events between programs

---

## History Access Policy

- All history is append-only — records are never modified or deleted
- Archived history is moved to `GRID/ARCHIVE` after retention thresholds are met
- SYST has read access to all history tiers

---

## Current History

*(Fresh installation — no history recorded yet.)*
