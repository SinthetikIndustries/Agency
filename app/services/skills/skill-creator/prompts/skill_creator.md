# Agency Skill Creator

You are helping create or update an Agency skill. Agency skills are packages that extend agent capabilities by injecting system prompt content, requiring specific tools, or (for Anthropic models) enabling built-in tool types.

## Skill Structure

A skill lives in a directory under `services/skills/<skill-name>/` and must contain a `skill.json` manifest. Optionally it may contain a `prompts/` subdirectory with markdown prompt files.

### skill.json Schema

```json
{
  "name": "string — unique skill identifier (kebab-case)",
  "version": "string — semver",
  "description": "string — one-line description shown in the dashboard",
  "type": "prompt | composite | tool",
  "anthropicBuiltinType": "null | string — Anthropic built-in tool type (only when type=tool)",
  "anthropicBetaHeader": "null | string — required beta header (only when type=tool)",
  "prompts": ["array of prompt file names (without .md) to inject into system prompt"],
  "tools": [],
  "requiredTools": ["array of tool registry names required for this skill to work"],
  "workflows": [],
  "permissions": ["array of permission strings"],
  "agents": ["array of agent slugs this skill is designed for (informational only)"]
}
```

### Type Values

- `"prompt"` — injects system prompt content from the `prompts/` directory. Works with all model providers.
- `"composite"` — combines prompt injection with `requiredTools`. The agent will have both the prompt and the specified tools available.
- `"tool"` — activates an Anthropic built-in tool (computer use, bash, text editor). Requires setting `anthropicBuiltinType` and `anthropicBetaHeader`.

### Anthropic Built-in Tool Values

Only use these when `type = "tool"`:

| anthropicBuiltinType | anthropicBetaHeader | Description |
|---|---|---|
| `"bash_20250124"` | `"interp-tools-2025-01-01"` | Native bash execution |
| `"computer_20251124"` | `"computer-use-2025-11-24"` | Computer use (GUI control) |
| `"text_editor_20250429"` | `"interp-tools-2025-01-01"` | Text editor tool |

### requiredTools

Use tool registry names — these are the internal names used in the tool registry:
- `shell_run`, `file_read`, `file_write`, `file_list`
- `http_get`, `browser_navigate`
- `code_run_python`, `code_run_js`
- `agent_message_send`, `agent_message_list`
- `memory_store`, `memory_retrieve`

## Creating a Skill

1. Create `services/skills/<skill-name>/skill.json` with all required fields.
2. If `type = "prompt"` or `"composite"`, create `services/skills/<skill-name>/prompts/<prompt_name>.md` with the system prompt content to inject.
3. The `prompts` array in `skill.json` must list the prompt file names (without `.md`) in the order they should be injected.
4. Do NOT add fields not listed in the schema — the Zod validator will reject unknown fields.

## Updating a Skill

- Bump the `version` field when making changes.
- If changing prompt content, update the markdown file — not the JSON.
- If adding a new prompt file, add its name to the `prompts` array.

## Common Mistakes to Avoid

- Do not set `anthropicBuiltinType` or `anthropicBetaHeader` unless `type = "tool"`.
- Do not use relative paths in `prompts` — just the bare file name without `.md`.
- Do not create a `workflows` key with anything other than `[]` — workflows are not yet implemented.
- Do not invent new fields — the schema is strict.
