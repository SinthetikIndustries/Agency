# Optional Ollama Model Selection During Install

**Date:** 2026-04-06
**Scope:** `cli/src/commands/install.ts` — Ollama model-pull block

## Problem

The installer unconditionally pulls all 4 Ollama models (`qwen3:1.7b`, `qwen3:8b`, `nemotron-3-nano:4b`, `gemma4:e4b`) whenever the Ollama daemon is ready, regardless of the user's preferences. This forces a potentially large download on every install with no opt-out.

## Design

### Trigger

The new prompt appears only when:
1. The user selected Ollama as their AI provider, AND
2. The Ollama daemon confirmed ready within the timeout

If the daemon did not start in time, the existing warning + skip path is unchanged.

### Prompt

After Ollama readiness is confirmed, display:

```
Select Ollama models to pull:
  1) qwen3:1.7b
  2) qwen3:8b
  3) nemotron-3-nano:4b
  4) gemma4:e4b
  a) All models
  0) None — skip for now

Choice [1/2/3/4/a/0]:
```

### Behavior per choice

| Input | Action |
|-------|--------|
| `1`–`4` | Pull only that model; skip the others |
| `a` | Pull all 4 (existing behavior, now opt-in) |
| `0` or blank or invalid | Skip all pulls; log a hint to use `agency models pull <model>` later |

### Skip-already-present check

The existing check (`ollama list` output includes model name → skip download) is preserved for each model that is selected for pull.

### Post-install note

When the user skips all models or picks one, log the remaining models as available for later:
```
  Models can be pulled any time: agency models pull <model>
```

## Files Changed

- `cli/src/commands/install.ts` — inline prompt added to Ollama model-pull block, no other files

## Out of Scope

- Multi-select (pick multiple but not all) — not requested
- Flag-driven (`--models=`) for non-interactive use — not requested
- Changes to `agency models pull` command — unchanged
