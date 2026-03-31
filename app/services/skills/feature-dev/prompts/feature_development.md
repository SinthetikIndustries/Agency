# Feature Development

## Overview

Systematic feature development: understand first, design second, implement last.

**Core principle:** Never implement before understanding the codebase and clarifying requirements.

---

## Phase 1: Discovery

**Goal:** Understand what needs to be built.

1. If the feature is unclear, ask the user:
   - What problem are they solving?
   - What should the feature do?
   - Any constraints or requirements?
2. Summarize your understanding and confirm with the user before proceeding.

---

## Phase 2: Codebase Exploration

**Goal:** Understand relevant existing code and patterns.

1. Find similar features already in the codebase and trace their implementation
2. Map the architecture of the area being changed — data flow, key abstractions, entry points
3. Identify UI patterns, testing approaches, and extension points relevant to the feature
4. Read the key files thoroughly — do not skim
5. Summarize findings: what patterns exist, what conventions are followed, what to reuse

---

## Phase 3: Clarifying Questions

**Goal:** Fill in all gaps before designing anything.

**CRITICAL: Do not skip this phase.**

1. Review codebase findings and the original feature request
2. Identify underspecified aspects:
   - Edge cases and error handling
   - Integration points with existing code
   - Scope boundaries
   - Backward compatibility requirements
   - Performance needs
3. Present all questions to the user in a clear, organized list
4. **Wait for answers before proceeding to architecture design**

If the user says "whatever you think is best" — provide your recommendation and get explicit confirmation before proceeding.

---

## Phase 4: Architecture Design

**Goal:** Design the implementation approach before writing code.

1. Consider multiple approaches with different trade-offs:
   - **Minimal change** — smallest diff, maximum reuse of existing code
   - **Clean architecture** — maintainability, elegant abstractions
   - **Pragmatic balance** — speed and quality combined
2. Form your recommendation based on the feature's size, urgency, and complexity
3. Present to the user:
   - Brief summary of each approach
   - Trade-offs comparison
   - Your recommendation with reasoning
4. **Ask the user which approach they prefer before implementing**

---

## Phase 5: Implementation

**Goal:** Build the feature following the chosen design.

**DO NOT START WITHOUT USER APPROVAL.**

1. Wait for explicit user approval of the approach
2. Read all relevant files identified in previous phases before writing any code
3. Implement following the chosen architecture
4. Follow existing codebase conventions strictly — match the style of surrounding code
5. Write clean, readable code
6. Track progress as you go

---

## Phase 6: Quality Review

**Goal:** Ensure the implementation is correct and clean.

1. Review for simplicity and DRY — is anything unnecessarily duplicated?
2. Review for bugs and functional correctness
3. Review for adherence to project conventions
4. Identify the highest severity issues
5. Present findings to the user and ask what they want to do (fix now, fix later, or proceed)
6. Address issues based on the user's decision

---

## Phase 7: Summary

**Goal:** Document what was accomplished.

1. Summarize what was built
2. List key decisions made during design
3. List files modified
4. Suggest next steps if any
