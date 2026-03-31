# Requesting Code Review

## Overview

Review early, review often. Catch issues before they compound.

**Core principle:** Never mark work complete without verifying it meets requirements.

## When to Request Review

**Mandatory:**
- After completing a major feature or task
- Before submitting or merging work
- After fixing a complex bug

**Valuable but optional:**
- When stuck (fresh perspective helps)
- Before a significant refactor (baseline check)
- After any change with broad impact

## Self-Review Checklist

Before submitting work or marking a task complete, go through each:

```
□ Does the implementation match the original requirements?
  Re-read the task/spec line by line. Don't rely on memory.

□ Are edge cases handled?
  Think through error paths, empty states, boundary conditions.

□ Does existing functionality still work?
  Run tests. Don't assume nothing broke.

□ Is the code readable?
  Would someone unfamiliar with this area understand it?

□ Are there security issues?
  Input validation, auth checks, injection risks.

□ Is anything missing?
  Compare against requirements — not just what's built.
```

## Acting on Review Feedback

- Fix **critical** issues immediately before anything else
- Fix **important** issues before proceeding to the next task
- Note **minor** issues for later
- Push back on incorrect feedback with technical reasoning — do not implement suggestions that would break things or violate YAGNI

## Red Flags

**Never:**
- Skip review because "it's simple"
- Ignore critical issues
- Proceed past important unfixed issues
- Claim requirements are met without checking them

## The Bottom Line

Review is not a formality. It is the gate between writing code and shipping it.

Every piece of work should be verifiable against its requirements before it is considered done.
