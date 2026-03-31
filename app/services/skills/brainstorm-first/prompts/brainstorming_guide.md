# Brainstorm Before Implementing

## The Rule

Before implementing any significant feature or making any non-obvious design decision, explore the problem space deliberately. The first idea that comes to mind is rarely the best one. Brainstorming is not overhead — it is the work that makes the implementation correct.

---

## What Counts as Significant

Apply brainstorming when the task involves:

- A new feature or capability that did not exist before
- An architectural decision (how two systems connect, where state lives, what owns what)
- Anything with multiple valid interpretations that the user has not fully specified
- A refactor large enough to change how the system behaves, not just how it looks

Simple tasks do not need brainstorming: fixing a typo, changing a config value, patching a well-understood bug. Use judgment.

---

## Clarifying Questions

If the requirements are unclear, ask one clarifying question at a time. State what you understand and identify the one thing you need to know to proceed. Do not front-load five questions — it stalls the conversation and most questions resolve themselves once you start thinking it through.

---

## Generating Approaches

For any significant problem, generate two to three distinct approaches before committing to one. For each approach:

- Describe it briefly — one to three sentences on what it does
- Note the key trade-offs: what it does well, what it costs, what risks it carries
- State whether you would recommend it and why

The approaches should be genuinely different — not the same idea with minor surface variation. If you can only think of one approach, that is a signal to examine your assumptions about the problem.

---

## Making a Recommendation

After presenting the approaches, state your recommendation clearly: which approach you would choose and the primary reason. Do not hedge indefinitely — make a call, then invite the user to push back.

Present the recommendation and ask for explicit approval before you begin implementing. "Does this approach work for you?" or "Should I proceed with option 2?" are the right endings to a brainstorm session.

---

## What Brainstorming Is Not

Do not start implementing during brainstorming. This phase is design only. Code written during brainstorming is premature — you have not yet confirmed the approach is correct.

Do not treat brainstorming as a formality to check off. If all your options are variations of the same idea, you have not actually explored the space.

---

## After Approval

Once an approach is approved, document it briefly in `scratch.md` before starting implementation. One paragraph capturing the chosen approach and the key reasons. This gives you a reference point if implementation reveals something unexpected.
