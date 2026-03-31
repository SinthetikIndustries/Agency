# Agent Spawning and Coordination

## When to Spawn a Sub-Agent

Spawning a sub-agent is appropriate when:

- You have two or more independent problems that do not share mutable state and can run in parallel
- A task requires a specialized focus that warrants a dedicated agent (a researcher for deep investigation, a developer for implementation work)
- The work is long-running and you need to continue with other tasks while it proceeds in the background

**Do not spawn sub-agents when:**

- Tasks have sequential dependencies — if task B needs the output of task A, spawning them in parallel produces a race condition, not a speedup
- Tasks share mutable state — two agents writing to the same files or database rows will conflict
- The task is simple and single-step — spawning overhead costs more than just doing the work yourself

The bar for spawning should be meaningful parallelism or genuine specialization, not a preference for delegation.

---

## Scoping a Sub-Agent's Work

A poorly scoped sub-agent is worse than not spawning one. Before creating a sub-agent, define:

- **One clear, bounded goal.** Not "investigate the codebase" — "find all usages of the `SessionManager` class and identify which ones pass a null `userId`."
- **All context the agent needs, provided explicitly.** Do not assume the sub-agent will discover context by exploring. Tell it which files are relevant, what the current state is, and what constraints apply.
- **Expected output format.** Should it return a JSON object, a list of file paths, a written analysis, modified files? Specify this so results can be used without interpretation.

---

## Using the Tools

**`agent_create`** — Create the sub-agent with a profile appropriate for the task. Use `developer` for code tasks, `researcher` for investigation and analysis, `analyst` for data tasks. Profile selection affects what tools and behaviors the agent has available.

**`agent_message_send`** — Send the task description as the first message. Include: the goal, all relevant context (file paths, current state, constraints), and the expected output format. For time-sensitive tasks, set priority to high. Do not assume the agent will ask follow-up questions.

**`agent_message_check`** — Poll for completion. Do not poll excessively. When the agent responds, read the full response before deciding what to do next. Do not override the agent's work without reading it.

---

## Coordinating Parallel Agents

When multiple sub-agents run simultaneously:

- Define clear output contracts before spawning. Each agent should produce output in a known format that you can merge without ambiguity.
- Ensure their work scopes do not overlap — two agents writing to the same file is a conflict waiting to happen.
- After all agents complete, you are responsible for reviewing and integrating their outputs. Sub-agents can make mistakes; treat their results as input to verify, not as ground truth.

---

## When Sub-Agents Fail

If a sub-agent fails or returns unusable output, do not immediately re-send the same task. Diagnose first:

- Was the task scope too broad?
- Was context missing or incorrect?
- Is this a problem better handled a different way?

If the same agent fails twice on the same task, decompose the task into smaller steps or handle it yourself. Retrying the same failing prompt a third time rarely produces a different result.
