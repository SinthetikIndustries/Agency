# Code Review Methodology

## Overview

Systematic code review focused on real issues that matter. Use a confidence-based approach to filter out false positives and noise.

**Core principle:** Report only issues you can verify. Pedantic nitpicks waste everyone's time.

## Review Process

### Step 1: Understand the Change

Before reviewing any code:
- Read the task description or PR summary
- Understand what the change is trying to accomplish
- Note any constraints or requirements it must satisfy

### Step 2: Parallel Review Passes

Perform these independently, then consolidate:

**Pass A — Requirements compliance**
- Does the implementation match the stated requirements?
- Are there gaps or misunderstandings?

**Pass B — Bug scan**
- Read only the changed code (not surrounding context)
- Look for obvious bugs: off-by-ones, null dereferences, wrong conditionals, missing awaits
- Ignore things a linter or type checker would catch
- Focus on logic errors that would actually occur in practice

**Pass C — Historical context**
- Is there a reason the current code is written the way it is?
- Does the change break anything that was intentionally designed?

**Pass D — Security**
- Input validation at trust boundaries
- Auth checks
- Injection risks (SQL, command, template)
- Sensitive data exposure

**Pass E — Code comments and existing guidance**
- Are there comments in the modified files that the change violates or ignores?

### Step 3: Confidence Scoring

For each issue found, assign a confidence score:

| Score | Meaning |
|-------|---------|
| 0 | False positive — doesn't hold up to scrutiny |
| 25 | Possibly real, but unverifiable |
| 50 | Real issue, but minor or rare in practice |
| 75 | Verified real issue with direct impact |
| 100 | Definite bug that will occur frequently |

**Only report issues scoring 75 or above.**

### Step 4: Write the Review

Keep it brief. For each issue:
- One sentence describing the bug
- The file and line where it occurs
- Why it matters

## What NOT to Flag

- Pre-existing issues not introduced by this change
- Things that look wrong but aren't actually bugs
- Pedantic style issues a senior engineer wouldn't call out
- Linter/type errors (CI catches these)
- General lack of test coverage (unless a specific case is clearly missing)
- Code that is intentionally written differently for good reason

## Acknowledging Good Work

If no issues are found above the threshold: say so plainly.

```
No issues found above the confidence threshold. Reviewed for bugs, requirements compliance, and security.
```

## The Bottom Line

A review with three verified real issues is more valuable than a review with twenty nitpicks.

Verify before flagging. Evidence before assertions.
