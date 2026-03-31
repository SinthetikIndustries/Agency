# Vault Writing Guide

You have access to a shared Obsidian knowledge vault. When writing to it, follow these conventions exactly. Poorly-formed documents break the knowledge graph and create noise for other agents and humans who rely on it.

---

## Before you write anything: search first

**Always call `vault_search` before creating a new document.** If a document on the topic already exists, update it — don't create a duplicate. Call `vault_related` on any existing document you find to discover what it already links to.

```
vault_search({ query: "your topic" })
vault_related({ slug: "found-document-name" })
```

If a document already exists and needs updating, use `vault_propose` with the same path. The sync system handles upserts.

---

## Required frontmatter

Every document you write **must** begin with YAML frontmatter:

```yaml
---
type: note | decision | pattern | preference | correction | reference | sop | project | person
tags: [tag1, tag2]
related: "[[Document One]], [[Document Two]]"
date: YYYY-MM-DD
status: proposal
owner: <your agent slug>
---
```

- `type` is required — choose the most specific one
- `status` must always be `proposal` for agent-authored documents — never `canon`
- `tags` should reuse existing tags where possible (search first to discover them)
- `related` lists direct semantic relationships, not every document you linked

---

## Wikilink syntax

Use `[[Document Name]]` to link to any other vault document. Rules:

- Use the document's **title** (heading or filename without `.md`), not its path
- For display text different from the title: `[[Document Name|display text]]`
- Always link to entities mentioned in your document — people, projects, decisions, tools
- Prefer specific links over generic ones: `[[API Rate Limiting Decision]]` not `[[Architecture]]`

**After writing, verify your links:** every `[[...]]` you write should correspond to a document that either already exists (check with `vault_search`) or that you are creating in the same session. Unresolved links pollute the graph.

---

## Document types and when to use them

| Type | Use for |
|------|---------|
| `note` | Observations, research findings, general information |
| `decision` | Architectural or strategic decisions with context and rationale |
| `pattern` | Reusable approaches or solutions observed across multiple contexts |
| `preference` | User or agent preferences (global or project-scoped) |
| `correction` | Documented mistakes and what the correct approach is |
| `reference` | External resources, APIs, documentation pointers |
| `sop` | Step-by-step standard operating procedures |
| `project` | Active project records with goals, status, stakeholders |
| `person` | People records — name, role, preferences, contact |

---

## The proposals → canon workflow

You write to `proposals/`. Humans review and approve to `canon/`.

- **Never write outside `proposals/`** — `vault_propose` enforces this
- Path inside proposals should mirror where it will live in canon: `vault_propose({ path: "decisions/use-postgres.md", content: "..." })`
- When a proposal gets approved to canon, existing links auto-resolve because the filename is the same

---

## Naming conventions

- Filenames: lowercase, hyphen-separated, descriptive: `api-rate-limiting-decision.md`
- Decision files: `<topic>-decision.md`
- SOP files: `<process-name>-sop.md`
- Person files: `<firstname-lastname>.md`
- Project files: `<project-name>.md`

---

## Keeping documents small and focused

- One document = one concept. Split if a document covers multiple independent ideas.
- Target: 200–600 words per document. Longer is fine for SOPs; shorter for decisions.
- Don't repeat content that's in another document — link to it instead.
- Don't write a document just to have it — only create documents that add genuine knowledge.

---

## Entity stubs

When you mention a named entity (person, project, tool, service) that doesn't have a vault document yet, create a minimal stub:

```markdown
---
type: person
tags: [person]
status: proposal
date: YYYY-MM-DD
owner: <your slug>
---

# Jane Smith

Role: Engineering Lead
```

This keeps links resolvable and lets the graph stay coherent. Better a thin stub than a broken link.

---

## What not to do

- Do not append to a `learnings` log — rewrite the relevant section instead
- Do not create documents with generic titles like `Notes` or `Misc`
- Do not use absolute paths in wikilinks
- Do not write to `canon/` directly
- Do not create a document without searching for an existing one first
- Do not leave `[[links]]` that you haven't verified resolve to something
