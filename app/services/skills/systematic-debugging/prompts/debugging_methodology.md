# Systematic Debugging Methodology

## Iron Law

**Never attempt a fix before you know the root cause.** Applying a fix without understanding why the error occurs is guessing. Guessing wastes time, introduces new bugs, and obscures the real problem. You must diagnose before you act.

---

## Phase 1: Evidence Gathering

Before touching any code, collect all available evidence.

- Read the full error message and stack trace — do not skim. The exact line, file, and error type matter.
- Reproduce the error yourself. If you cannot reproduce it, you do not yet understand it well enough to fix it.
- Check what changed recently. A bug that appeared now was probably introduced recently — look at recent edits, dependency updates, or environment changes.
- Gather diagnostic output: logs, test output, network responses, environment variables. Prefer concrete data over assumptions.

Do not proceed to Phase 2 until you have a clear, reproducible picture of what is failing and when.

---

## Phase 2: Pattern Analysis

Find a working reference point and compare it against the broken state.

- Locate working examples of similar code — another function, another test, another service that does the same thing successfully.
- Compare the working and broken cases systematically. What is different? Focus on structure, types, order of operations, and dependencies.
- Identify the exact divergence point. Not "this area looks different" — the specific line, value, or condition where the behavior splits.

If you cannot identify a divergence, your evidence in Phase 1 was incomplete. Go back and gather more.

---

## Phase 3: Hypothesis Formation

Form one specific, falsifiable hypothesis about the root cause.

- State it precisely: "The error is caused by X because Y."
- Test exactly one variable. Change nothing else. If you change multiple things at once, you learn nothing.
- If your hypothesis is wrong, discard it fully and form a new one based on updated evidence — do not keep tweaking the same failed idea.

If three or more fixes have failed, stop. Do not attempt fix number four. Step back and question whether your mental model of the system is correct. Re-read the architecture, re-read the relevant code from scratch, or explain the problem aloud. The issue is likely somewhere you have not looked.

---

## Phase 4: Fix and Verify

Only act after the root cause is confirmed.

- Write a test case that fails due to the bug before implementing the fix.
- Implement the minimal change that addresses the root cause — do not refactor or improve unrelated code at the same time.
- Run the test. It must pass. Verify the output yourself; do not assume.
- Check for regressions: run the full test suite, not just the targeted test.

**Never claim a bug is fixed without running verification and seeing the output with your own observation.** "It should work now" is not a fix — passing tests are.

---

## Multi-Layer Systems

When a bug spans multiple components or services:

- Add diagnostic output at each component boundary to isolate which layer is misbehaving.
- Trace data backward through the call stack from the point of failure toward the origin.
- Confirm which layer produces incorrect data before assuming the consumer of that data is at fault.
