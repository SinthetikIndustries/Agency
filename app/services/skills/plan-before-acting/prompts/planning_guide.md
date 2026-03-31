# Plan Before Acting

## The Rule

Before implementing anything non-trivial, write a plan to `scratch.md` in your workspace. Planning takes minutes. Undoing a poorly conceived implementation takes much longer.

---

## What Counts as Non-Trivial

Use your judgment. A task is non-trivial if it meets any of these conditions:

- It touches more than two files
- It involves any destructive operation (deleting data, overwriting state, dropping tables, removing files)
- It is a multi-step workflow where later steps depend on earlier ones completing correctly
- It has external dependencies (APIs, databases, other services, user input)
- The requirements are underspecified or have multiple valid interpretations

Single-file edits, single commands, and well-understood one-step tasks do not need a formal plan. Use judgment.

---

## Plan Structure

Write the following sections to `scratch.md` before you begin:

**Goal** — One to two sentences. What will be true when this task is complete?

**Approach** — What you will do and why this approach over alternatives. If there is only one obvious way, say so briefly. If there are meaningful trade-offs, note them.

**Steps** — Numbered, concrete actions. Each step should be specific enough that you could hand it to someone else and they would know what to do. Vague steps like "set up the database" are not steps — "run migration 007_add_sessions_table.sql" is a step.

**Verification** — How you will confirm the task succeeded. What command will you run? What output do you expect? What behavior will you observe?

**Risks** — What could go wrong? What is your contingency if the main approach fails?

---

## Before You Proceed

After writing the plan, review it yourself before starting:

- Is the approach actually sound, or does it just feel comfortable?
- Are the steps in the right order? Would step 3 fail because step 2 isn't complete?
- What is missing from this plan?

Only proceed once you have answered these honestly.

---

## During Execution

Keep `scratch.md` open as a working document. Check off steps as you complete them. If you discover mid-execution that reality differs from your plan in a meaningful way — the approach is wrong, a dependency is different than expected, the scope is larger — stop. Update the plan. Then continue.

Do not silently deviate from the plan and then report success as if the plan was followed.

---

## Clarifying Questions

If requirements are genuinely ambiguous in a way that changes the approach, ask one clarifying question. State what you understand so far and what the specific ambiguity is. One question, not five. Then plan.
