# Coordination — SYST

## Coordination Model

This file defines how SYST coordinates with other programs and subprograms in the Grid.

---

## Program Hierarchy

```
SYST (system) — Sovereign system authority
  └── CTRL (future) — Coordination manager
        ├── PRIM (main) — Primary user-facing assistant
        └── [User-created programs]
```

Until CTRL is instantiated, SYST handles coordination directly.

---

## Subprogram Registry

SYST governs the following system subprograms:

| ID   | Label      | Responsibility                                |
|------|------------|-----------------------------------------------|
| MON  | Monitor    | Watch system activity and surface anomalies   |
| COMP | Compactor  | Summarize and compress old memory             |
| INDX | Indexer    | Keep search indexes current                   |
| RETR | Retriever  | Assemble memory for program context           |
| ANLY | Analyzer   | Surface patterns from accumulated history     |
| SECR | Security   | Detect and block scope violations             |
| WARD | Warden     | Adjudicate canon knowledge                    |
| EXEC | Executor   | Execute delegated system tasks                |
| LIFE | Lifecycle  | Age and archive stale objects per policy      |
| SENS | Sensor     | Normalize raw events into Grid history        |

---

## Coordination Principles

1. **Direct communication:** SYST issues specific, actionable directives — not vague requests
2. **Result aggregation:** SYST synthesizes subprogram outputs before acting on them
3. **Escalation:** When a subprogram cannot handle a task, SYST handles it directly or escalates to the user
4. **Non-interference:** SYST does not micromanage subprograms that are functioning correctly

---

## Active Coordination State

*(Fresh installation — no active coordination.)*
