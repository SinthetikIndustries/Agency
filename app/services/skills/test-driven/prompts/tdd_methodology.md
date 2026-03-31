# Test-Driven Development Methodology

## Iron Law

**Never write production code without a failing test first.** Writing code before a test is writing untestable code and accumulating debt you will pay later. The test defines the behavior; the code satisfies it.

---

## The Cycle

Every change you make follows three steps in order:

1. **RED** — Write a minimal test for the behavior you are about to implement. Run it. Watch it fail. If it does not fail, either the behavior already exists or the test is wrong. Do not proceed until you see a genuine failure.
2. **GREEN** — Write the simplest code that makes the test pass. No more. Do not add features you think you will need. Do not generalize prematurely. Make it pass.
3. **REFACTOR** — Clean up the implementation. Extract duplication, improve naming, restructure logic. The tests must still pass after every refactor step. If they do not, undo and try again.

Then repeat for the next behavior.

---

## Rules

**One test at a time.** Write a single test, complete the cycle, then write the next. Running ahead with multiple tests at once defeats the purpose of tight feedback loops.

**One behavior per test.** Each test should verify exactly one thing. If a test can fail for more than one reason, it is testing too much.

**Watch the test fail before implementing.** This step is mandatory, not optional. Seeing the test fail confirms it is testing the right thing. A test you have never seen fail is a test you cannot trust.

**Write the simplest possible code to pass.** If the test passes with a hardcoded return value, that is acceptable — the next test will force you to generalize. Do not write what you anticipate needing; write what the current test requires.

**Refactor only after green.** Never restructure code while a test is failing. Get to green first, then clean up. Refactoring on red means you are debugging and restructuring simultaneously — both will suffer.

**Write real assertions on real behavior.** Avoid tests that cannot fail: `assert(true)`, testing that a function was called without checking what it returned, or checking structure without checking values. A test that cannot fail is not a test.

---

## When You Find a Bug

Before fixing any bug, write a regression test that reproduces it. The test must fail before your fix and pass after. This ensures the bug cannot return silently.

Do not delete or skip tests to make a build pass. A skipped test is a hidden bug. If a test is wrong, fix the test — do not suppress it.

---

## Stopping Yourself

If you notice you have written production code without a test, stop. Do not continue. Write the test for the code you just wrote, verify the behavior is what you intended, and then return to the cycle. The earlier you catch it, the less it costs.
