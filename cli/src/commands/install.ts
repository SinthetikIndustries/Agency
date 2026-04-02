// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { randomUUID } from 'node:crypto'
import { mkdir, chmod, readFile, writeFile, access } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { writeConfig, writeCredentials, agencyDir } from '../lib/config.js'
import { findRepoRoot } from '../lib/repo.js'
import { startGateway, stopGateway, startDashboard, GatewayNotRunningError } from '../lib/process.js'
import { gatewayFetch } from '../lib/gateway.js'
import { PORTS } from '../lib/ports.js'

// ─── Exported helpers (tested independently) ─────────────────────────────────

export interface DefaultConfigOptions {
  profile: string
  repoDir: string
  userName: string
  provider: 'anthropic' | 'openai' | 'ollama'
}

export function buildDefaultConfig(opts: DefaultConfigOptions): Record<string, unknown> {
  const { profile, repoDir, userName } = opts
  const ollamaProvider = opts.provider === 'ollama'
  const openaiProvider = opts.provider === 'openai'

  return {
    name: userName,
    profile,
    repoDir,
    gatewayDir: join(repoDir, 'app', 'apps', 'gateway'),
    gateway: {
      port: PORTS.GATEWAY,
      host: '127.0.0.1',
      logLevel: 'info',
      auth: {
        jwtSecret: randomUUID() + randomUUID(),
        jwtExpiryHours: 24,
      },
      rateLimit: { max: 100, timeWindow: '1 minute' },
    },
    modelRouter: {
      defaultModel: ollamaProvider ? 'qwen3:1.7b' : openaiProvider ? 'gpt-4.1' : 'claude-sonnet-4-6',
      tiers: ollamaProvider
        ? { cheap: 'qwen3:1.7b', strong: 'qwen3:1.7b' }
        : openaiProvider
          ? { cheap: 'gpt-4.1-mini', strong: 'gpt-4.1' }
          : { cheap: 'claude-haiku-4-5', strong: 'claude-sonnet-4-6' },
      providers: {
        anthropic: { enabled: !ollamaProvider && !openaiProvider },
        openai: { enabled: openaiProvider },
        ollama: { enabled: true, endpoint: `http://localhost:${PORTS.OLLAMA}` },
      },
      fallback: { cheap: null, strong: ollamaProvider ? 'qwen3:1.7b' : openaiProvider ? 'gpt-4.1' : 'claude-sonnet-4-6' },
      embedding: { provider: ollamaProvider ? 'ollama' : openaiProvider ? 'openai' : 'anthropic', model: ollamaProvider ? 'nomic-embed-text' : openaiProvider ? 'text-embedding-3-small' : 'voyage-3' },
    },
    daemons: {
      orchestrator: { enabled: true },
      modelRouter: { enabled: true },
      vaultSync: {
        enabled: true,
        vaultPath: join(homedir(), '.agency', 'vault'),
      },
    },
    orchestrator: {
      defaultAgent: 'main',
      maxWorkflowSteps: 20,
      approvalTimeoutSeconds: 300,
    },
    redis: { url: `redis://localhost:${PORTS.REDIS}` },
  }
}

export async function seedVault(vaultPath: string, userName: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)

  // Directory skeleton
  const dirs = [
    'brain/people', 'brain/companies', 'brain/relationships',
    'brain/decisions', 'brain/projects', 'brain/meetings',
    'brain/learnings', 'brain/context', 'brain/inbox',
    'canon/personal', 'canon/work', 'canon/projects', 'canon/reference',
    'proposals/personal', 'proposals/work', 'proposals/projects', 'proposals/reference',
    'notes', 'templates',
  ]
  for (const d of dirs) {
    await mkdir(join(vaultPath, d), { recursive: true })
  }

  // README files
  const readmes: Record<string, string> = {
    'README.md': `---
title: Agency Vault
type: readme
status: active
---

# Agency Vault

Your personal knowledge base. Everything that matters lives here.

## Structure

- \`brain/\` — Agent-maintained living knowledge. Written via \`vault_remember\`.
- \`proposals/\` — Agent drafts awaiting your review. Written via \`vault_propose\`.
- \`canon/\` — Your approved authoritative knowledge. Promoted from proposals/.
- \`templates/\` — Document starters for every type.
- \`notes/\` — Free-form scratch. Synced and searchable.

## Lifecycle

\`\`\`
brain/ → proposals/ → canon/
\`\`\`

## Frontmatter Required Fields

Every document must include:
- \`title:\` — human-readable title
- \`date:\` — ISO date (YYYY-MM-DD)
- \`type:\` — document type (person, decision, meeting, project, learning, etc.)
- \`status:\` — draft | active | archived | canon
`,

    'brain/README.md': `---
title: Brain — Agent Working Memory
type: readme
status: active
---

# Brain

Agent-maintained living knowledge. Written and updated in real time as your agent learns, observes, and helps you decide.

## Subdirectories

| Folder | Contents |
|--------|---------|
| \`people/\` | People you know — contacts, colleagues, friends |
| \`companies/\` | Companies and organizations |
| \`relationships/\` | Relationship health, interaction history, open items |
| \`decisions/\` | Decisions made with reasoning and outcomes |
| \`projects/\` | Active projects, status, milestones |
| \`meetings/\` | Meeting notes and summaries |
| \`learnings/\` | Insights, patterns, lessons learned |
| \`context/\` | Stable facts about you — preferences, background, goals |
| \`inbox/\` | Unprocessed observations. Reviewed and routed regularly. |

## How to write here

Search before creating — update existing docs rather than duplicating.
`,

    'canon/README.md': `---
title: Canon — Approved Knowledge
type: readme
status: active
---

# Canon

Reviewed and approved by you. This is authoritative truth your agent can rely on.

## Structure

| Folder | Contents |
|--------|---------|
| \`personal/\` | Personal context — values, habits, goals, preferences |
| \`work/\` | Work-related approved documents |
| \`projects/\` | Approved project records |
| \`reference/\` | SOPs, how-tos, reference material |

## How documents get here

1. Agent drafts in \`proposals/\`
2. You review and approve
3. Move to the appropriate \`canon/\` subfolder

## Frontmatter standard

\`\`\`yaml
---
title: "Document Title"
date: YYYY-MM-DD
type: sop
status: canon
reviewed-by: ${userName}
reviewed-at: YYYY-MM-DD
---
\`\`\`
`,

    'proposals/README.md': `---
title: Proposals — Drafts Awaiting Review
type: readme
status: active
---

# Proposals

Your agent writes drafts here for you to review. The best ones get promoted to \`canon/\`.

## Structure

| Folder | Contents |
|--------|---------|
| \`personal/\` | Personal context drafts |
| \`work/\` | Work-related proposals |
| \`projects/\` | Project proposals |
| \`reference/\` | Reference document drafts |

## Lifecycle

\`\`\`
proposals/ → you review → canon/
\`\`\`
`,

    'notes/README.md': `---
title: Notes — Free-form Scratch
type: readme
status: active
---

# Notes

Free-form scratch space. Rough thinking, quick captures, ideas, links.

When a note evolves into something worth keeping, move it to \`brain/\` or \`proposals/\`.
`,

    'templates/README.md': `---
title: Templates
type: readme
status: active
---

# Templates

Document starters. Always begin from a template for consistent structure.

| Template | Use for |
|----------|---------|
| \`person.md\` | Person profiles |
| \`decision.md\` | Decision records |
| \`meeting.md\` | Meeting notes |
| \`project.md\` | Project tracking |
| \`learning.md\` | Insights and lessons |
| \`research.md\` | Research reports |
| \`proposal.md\` | General proposals |
| \`sop.md\` | Standard operating procedures |
| \`relationship.md\` | Relationship health |
`,
  }

  // Template files
  const templates: Record<string, string> = {
    'templates/person.md': `---
title: "{{Full Name}}"
date: ${today}
type: person
status: active
author: {{agent}}
tags: [person]
related: []
---

# {{Full Name}}

## Identity

| Field | Value |
|-------|-------|
| Role | |
| Company | |
| Location | |
| Email | |

## Background

Brief background summary.

## Relationship

How we connected. What they care about.

## Communication Style

- How they prefer to communicate
- What works well
- What to avoid

## Key Priorities

-

## Notes

---
*Last updated by [[{{agent}}]] on {{date}}*
`,

    'templates/decision.md': `---
title: "Decision: {{title}}"
date: ${today}
type: decision
status: active
author: {{agent}}
tags: [decision]
related: []
---

# {{Title}}

## Context

What situation prompted this decision?

## Options Considered

1. **Option A** — pros/cons
2. **Option B** — pros/cons

## Decision

What was decided and why?

## Outcome

_To be updated after implementation._

---
*Recorded by [[{{agent}}]] on {{date}}*
`,

    'templates/meeting.md': `---
title: "Meeting: {{topic}} — {{YYYY-MM-DD}}"
date: ${today}
type: meeting
status: active
author: {{agent}}
tags: [meeting]
related: []
---

# {{Topic}}

**Date:** {{YYYY-MM-DD}}
**Attendees:**

## Agenda

-

## Notes

## Decisions Made

-

## Action Items

| Item | Owner | Due |
|------|-------|-----|
| | | |

---
*Notes by [[{{agent}}]]*
`,

    'templates/project.md': `---
title: "{{Project Name}}"
date: ${today}
type: project
status: active
author: {{agent}}
tags: [project]
related: []
---

# {{Project Name}}

**Status:** active / paused / complete
**Started:** {{YYYY-MM-DD}}
**Target:**

## Goal

What does success look like?

## Milestones

| Milestone | Status | Date |
|-----------|--------|------|
| | | |

## Notes

---
*Last updated by [[{{agent}}]] on {{date}}*
`,

    'templates/learning.md': `---
title: "Learning: {{title}}"
date: ${today}
type: learning
status: active
author: {{agent}}
tags: [learning]
related: []
---

# {{Title}}

## What Happened

## What I Learned

## Why It Matters

## How to Apply This

---
*Recorded by [[{{agent}}]] on {{date}}*
`,

    'templates/research.md': `---
title: "Research: {{title}}"
date: ${today}
type: research
status: draft
author: {{agent}}
tags: [research]
related: []
---

# {{Title}}

## Question / Goal

What are we trying to understand?

## Findings

## Sources

-

## Conclusions

## Recommended Actions

---
*Research by [[{{agent}}]] on {{date}}*
`,

    'templates/proposal.md': `---
title: "Proposal: {{title}}"
date: ${today}
type: proposal
status: draft
author: {{agent}}
tags: [proposal]
related: []
---

# {{Title}}

## Summary

What is being proposed and why.

## Background

Context that motivates this proposal.

## Proposed Approach

## Expected Outcomes

## Risks & Mitigations

## Questions for Review

_Specific questions or decisions needed._

---
*Proposed by [[{{agent}}]] on {{date}}*
`,

    'templates/sop.md': `---
title: "SOP: {{Process Name}}"
date: ${today}
type: sop
status: draft
author: {{agent}}
tags: [sop]
related: []
---

# {{Process Name}}

**Applies to:**
**Trigger:** When does this process start?

## Steps

1.
2.
3.

## Notes & Exceptions

---
*Drafted by [[{{agent}}]] on {{date}}*
`,

    'templates/relationship.md': `---
title: "Relationship: {{Name}}"
date: ${today}
type: relationship
status: active
author: {{agent}}
tags: [relationship]
related: []
---

# {{Name}}

**Type:** colleague / friend / partner / client / vendor
**Health:** strong / neutral / at-risk
**Primary contact:** [[people/...]]

## Summary

## Recent Interactions

| Date | Type | Notes |
|------|------|-------|
| | | |

## Open Items

-

---
*Last updated by [[{{agent}}]] on {{date}}*
`,
  }

  // Write all README files
  for (const [relPath, content] of Object.entries(readmes)) {
    await writeFile(join(vaultPath, relPath), content, 'utf8')
  }

  // Write templates (only if not already present)
  for (const [relPath, content] of Object.entries(templates)) {
    const fullPath = join(vaultPath, relPath)
    try {
      await access(fullPath)
      // already exists — skip
    } catch {
      await writeFile(fullPath, content, 'utf8')
    }
  }
}

export async function setupObsidianVault(
  vaultPath: string,
  obsidianConfigPath: string,
): Promise<void> {
  // Directories are already created by seedVault — just register with Obsidian

  // Read existing Obsidian config or start fresh
  let obsidianConfig: { vaults: Record<string, { path: string; ts: number; open: boolean }> }
  try {
    const raw = await readFile(obsidianConfigPath, 'utf8')
    obsidianConfig = JSON.parse(raw)
  } catch {
    obsidianConfig = { vaults: {} }
  }

  // Defensive: ensure vaults key exists even if config was written without it
  obsidianConfig.vaults ??= {}

  // Only register if not already present
  const alreadyRegistered = Object.values(obsidianConfig.vaults).some(v => v.path === vaultPath)
  if (!alreadyRegistered) {
    const uuid = randomUUID().replace(/-/g, '')
    obsidianConfig.vaults[uuid] = { path: vaultPath, ts: Date.now(), open: true }
  }

  // Ensure parent dir exists (Obsidian may not be installed yet)
  const parentDir = join(obsidianConfigPath, '..')
  await mkdir(parentDir, { recursive: true })
  await writeFile(obsidianConfigPath, JSON.stringify(obsidianConfig, null, 2), 'utf8')
}

// ─── Prompt helper ────────────────────────────────────────────────────────────

async function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()))
  })
}

// ─── Agent seeding ────────────────────────────────────────────────────────────

const PRESET_AGENTS = ['Researcher', 'Coder', 'Writer']

async function seedAgents(mainAgentName: string): Promise<void> {
  // Rename main agent to user's chosen name
  await gatewayFetch('/agents/main', {
    method: 'PATCH',
    body: JSON.stringify({ name: mainAgentName }),
  })

  // Create preset agents (workspace created automatically by orchestrator)
  for (const name of PRESET_AGENTS) {
    await gatewayFetch('/agents', {
      method: 'POST',
      body: JSON.stringify({ name, lifecycleType: 'dormant', shellPermissionLevel: 'none' }),
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('409') && !msg.toLowerCase().includes('conflict') && !msg.toLowerCase().includes('already exists')) {
        throw err
      }
    })
  }
}

// ─── Command ─────────────────────────────────────────────────────────────────

export default class Install extends Command {
  static summary = 'Bootstrap and install Agency'

  async run(): Promise<void> {
    await this.parse(Install)

    this.log(chalk.cyan('Agency') + chalk.gray(' › ') + 'Starting installation...')
    this.log('')

    // Create ~/.agency/
    process.stdout.write(chalk.gray('  Creating ~/.agency/ directory... '))
    await mkdir(agencyDir, { recursive: true })
    await chmod(agencyDir, 0o700)
    this.log(chalk.green('done'))

    const rl = createInterface({ input: process.stdin, output: process.stdout })

    try {
      // Onboarding: user name
      const userName = (await prompt(rl, chalk.cyan('Your name') + chalk.gray(': '))) || 'User'

      // Onboarding: main agent name
      const agentName = (await prompt(
        rl,
        chalk.cyan('Name your main agent') + chalk.gray(' (e.g. Aria, Max): '),
      )) || 'Agent'

      // AI provider
      this.log('')
      this.log('AI provider:')
      this.log('  1) Anthropic (Claude) — recommended')
      this.log('  2) OpenAI (GPT)')
      this.log('  3) Ollama (local, no API key required)')
      const providerChoice = await prompt(rl, chalk.cyan('Provider') + chalk.gray(' [1-3, default: 1]: '))
      const useOllama = providerChoice === '3'
      const useOpenAI = providerChoice === '2'
      let aiApiKey = ''
      if (!useOllama) {
        aiApiKey = await prompt(
          rl,
          useOpenAI
            ? chalk.cyan('OpenAI API key') + chalk.gray(' (sk-...): ')
            : chalk.cyan('Anthropic API key') + chalk.gray(' (sk-ant-...): '),
        )
        if (!aiApiKey) {
          this.error('API key is required.')
        }
      }

      // Repo path
      const detected = await findRepoRoot(process.cwd())
      const defaultRepoDir = detected ?? join(homedir(), 'agency')
      const repoDirInput = await prompt(
        rl,
        chalk.cyan('Repo path') + chalk.gray(` [${defaultRepoDir}]: `),
      )
      const repoDir = repoDirInput || defaultRepoDir

      this.log('')

      // Start Docker infra
      process.stdout.write(chalk.gray('  Starting Docker (Postgres + Redis)... '))
      const composeFile = join(repoDir, 'installation', 'docker-compose.yml')
      const dockerResult = spawnSync('docker', ['compose', '-f', composeFile, 'up', '-d'], {
        stdio: 'pipe',
      })
      if (dockerResult.status !== 0) {
        const stderr = dockerResult.stderr?.toString() ?? ''
        this.error(`Docker Compose failed: ${stderr || 'check that Docker is running'}`)
      }
      this.log(chalk.green('done'))

      // Wait for Ollama daemon to be ready (up to 30s)
      process.stdout.write(chalk.gray('  Waiting for Ollama to be ready...'))
      let ollamaReady = false
      for (let attempt = 0; attempt < 30; attempt++) {
        const check = spawnSync('docker', ['exec', 'agency-ollama', 'ollama', 'list'], { stdio: 'pipe' })
        if (check.status === 0) { ollamaReady = true; break }
        spawnSync('sleep', ['1'])
      }
      if (!ollamaReady) {
        this.warn('Ollama daemon did not start in time — run `docker exec agency-ollama ollama pull qwen3:1.7b` manually after install.')
      } else {
        this.log(chalk.green(' ready'))
        // Check if model already exists before pulling
        const modelCheck = spawnSync(
          'docker', ['exec', 'agency-ollama', 'ollama', 'list'],
          { stdio: 'pipe' }
        )
        const modelList = modelCheck.stdout?.toString() ?? ''
        if (modelList.includes('qwen3:1.7b')) {
          this.log(chalk.gray('  Ollama model qwen3:1.7b already present, skipping download.'))
        } else {
          this.log(chalk.gray('  Pulling Ollama model qwen3:1.7b (this may take a moment)...'))
          const ollamaPullResult = spawnSync(
            'docker', ['exec', 'agency-ollama', 'ollama', 'pull', 'qwen3:1.7b'],
            { stdio: 'inherit' }
          )
          if (ollamaPullResult.status !== 0) {
            this.warn('Ollama model pull failed — run `docker exec agency-ollama ollama pull qwen3:1.7b` manually after install.')
          } else {
            this.log(chalk.green('  Ollama model ready.'))
          }
        }
      }

      // pnpm install
      const appDir = join(repoDir, 'app')
      process.stdout.write(chalk.gray('  Installing dependencies... '))
      const installResult = spawnSync('pnpm', ['install'], { cwd: appDir, stdio: 'pipe' })
      if (installResult.status !== 0) {
        this.error('pnpm install failed: ' + (installResult.stderr?.toString() ?? ''))
      }
      this.log(chalk.green('done'))

      // pnpm build
      process.stdout.write(chalk.gray('  Building app... '))
      const buildResult = spawnSync('pnpm', ['build'], { cwd: appDir, stdio: 'pipe' })
      if (buildResult.status !== 0) {
        this.error('pnpm build failed: ' + (buildResult.stderr?.toString() ?? ''))
      }
      this.log(chalk.green('done'))

      // Write config + credentials (must happen before starting gateway)
      const apiKey = 'agency-key-' + randomUUID()
      const provider = useOllama ? 'ollama' : useOpenAI ? 'openai' : 'anthropic'
      const config = buildDefaultConfig({ profile: 'basic', repoDir, userName, provider })
      await writeConfig(config)
      await writeCredentials({
        gateway: { apiKey },
        ...(useOllama
          ? {}
          : useOpenAI
            ? { openai: { apiKey: aiApiKey } }
            : { anthropic: { apiKey: aiApiKey } }),
        postgres: { url: `postgresql://agency:agency@localhost:${PORTS.POSTGRES}/agency` },
        redis: { url: `redis://localhost:${PORTS.REDIS}` },
      })

      // Start gateway (runs DB migrations on startup, creates main agent)
      process.stdout.write(chalk.gray('  Starting gateway... '))
      const gatewayDir = join(repoDir, 'app', 'apps', 'gateway')
      await startGateway(gatewayDir)
      this.log(chalk.green('done'))

      // Seed agents via API
      process.stdout.write(chalk.gray('  Creating default agents... '))
      await seedAgents(agentName)
      this.log(chalk.green('done'))

      // Write initial context files for all agents
      process.stdout.write(chalk.gray('  Writing agent context... '))
      const agentsBaseDir = join(homedir(), '.agency', 'agents')

      const agentDefs = [
        {
          slug: 'main',
          identity: `# Identity\n\nYou are ${agentName}, a personal AI agent.\n`,
          soul: `# Soul\n\nYou are helpful, direct, and thoughtful. You adapt to the user's needs and communicate clearly without unnecessary filler.\n`,
          capabilities: `# Capabilities\n\nYou can read and write files, browse the web via HTTP, manage other agents, search the vault, and send messages between agents.\n`,
        },
        {
          slug: 'researcher',
          identity: `# Identity\n\nYou are Researcher, a specialist agent focused on finding, analyzing, and summarizing information.\n`,
          soul: `# Soul\n\nYou are thorough, precise, and objective. You dig deep into topics, evaluate sources critically, and present findings clearly.\n`,
          capabilities: `# Capabilities\n\nYou can search the web via HTTP requests, read files, write research notes to the vault, and summarize complex topics.\n`,
        },
        {
          slug: 'coder',
          identity: `# Identity\n\nYou are Coder, a specialist agent focused on writing, reviewing, and debugging code.\n`,
          soul: `# Soul\n\nYou are precise, pragmatic, and detail-oriented. You write clean, efficient code and explain your reasoning clearly.\n`,
          capabilities: `# Capabilities\n\nYou can read and write files, run shell commands (when permitted), review code, and produce working solutions across languages and frameworks.\n`,
        },
        {
          slug: 'writer',
          identity: `# Identity\n\nYou are Writer, a specialist agent focused on crafting clear and compelling written content.\n`,
          soul: `# Soul\n\nYou are creative, adaptable, and clear. You match tone and style to the task — from technical documentation to persuasive copy.\n`,
          capabilities: `# Capabilities\n\nYou can read and write files, draft and edit documents, and save finished work to the vault.\n`,
        },
      ]

      const userCtx = `# User\n\nName: ${userName}\n`

      for (const def of agentDefs) {
        const configDir = join(agentsBaseDir, def.slug, 'config')
        await mkdir(configDir, { recursive: true })
        await writeFile(join(configDir, 'identity.md'), def.identity, 'utf8')
        await writeFile(join(configDir, 'soul.md'), def.soul, 'utf8')
        await writeFile(join(configDir, 'user.md'), userCtx, 'utf8')
        await writeFile(join(configDir, 'capabilities.md'), def.capabilities, 'utf8')
        await writeFile(join(configDir, 'heartbeat.md'), '', 'utf8')
        await writeFile(join(configDir, 'scratch.md'), '', 'utf8')
      }
      this.log(chalk.green('done'))

      // Vault scaffold + Obsidian registration
      const vaultPath = join(homedir(), '.agency', 'vault')
      const obsidianConfigPath = join(homedir(), '.config', 'obsidian', 'obsidian.json')
      process.stdout.write(chalk.gray('  Setting up vault... '))
      await seedVault(vaultPath, userName)
      await setupObsidianVault(vaultPath, obsidianConfigPath)
      this.log(chalk.green('done'))

      // Start dashboard
      process.stdout.write(chalk.gray('  Starting dashboard... '))
      await startDashboard(join(repoDir, 'app'))
      this.log(chalk.green('done'))

      // Print success
      this.log('')
      this.log(chalk.green('✓') + ' Agency is ready!')
      this.log('')
      this.log(chalk.bold('  Open the dashboard and log in with your API key:'))
      this.log('')
      this.log(chalk.gray('  Dashboard:   ') + chalk.cyan(`http://localhost:${PORTS.DASHBOARD}`))
      this.log(chalk.gray('  API key:     ') + chalk.yellow(apiKey))
      this.log(chalk.gray('  Vault:       ') + vaultPath)
      this.log('')
      this.log(chalk.gray('  agency stop     — stop all services'))
      this.log(chalk.gray('  agency start    — start all services'))
      this.log(chalk.gray('  agency status   — check service health'))
    } finally {
      rl.close()
    }
  }
}
