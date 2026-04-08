# Links — SYST

## Grid Relationships

This file documents SYST's key relationships within the Grid knowledge graph.

---

## Structural Position

```
GRID/SYSTEM
  └── GRID/SYSTEM/SYST  (this program)
        ├── GRID/SYSTEM/CTRL  (future — coordination manager)
        ├── GRID/SYSTEM/control-plane
        ├── GRID/SYSTEM/subprograms
        │     ├── MON, COMP, INDX, RETR, ANLY
        │     └── SECR, WARD, EXEC, LIFE, SENS
        └── GRID/SYSTEM/runtime
```

---

## Key Grid Paths

| Path                              | Description                          |
|-----------------------------------|--------------------------------------|
| GRID/SYSTEM/SYST                  | This program's root node             |
| GRID/SYSTEM/CTRL                  | Coordination manager (future)        |
| GRID/SYSTEM/control-plane         | Rules and governance policy          |
| GRID/SYSTEM/subprograms           | Subprogram registry                  |
| GRID/SYSTEM/runtime               | Live execution state                 |
| GRID/PROGRAMS/PRIM                | Primary user-facing program          |
| GRID/PROGRAMS/instances           | User-created programs                |
| GRID/MEMORY                       | Grid memory system                   |
| GRID/HISTORY                      | Grid history record                  |

---

## External Links

*(None — fresh installation. Links to external systems, integrations, or connected resources will appear here as the installation is configured.)*

---

## Program Links

| Program | Slug   | Relationship      |
|---------|--------|-------------------|
| PRIM    | main   | Governed by SYST  |
| CTRL    | ctrl   | Future — planned  |
