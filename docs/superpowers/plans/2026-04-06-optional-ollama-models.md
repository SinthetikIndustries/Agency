# Optional Ollama Model Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unconditional Ollama model pull during `agency install` with an interactive prompt letting the user pick one model, all, or none.

**Architecture:** Extract a pure `selectOllamaModels` function (exported for unit testing) that takes a prompt callback and returns the list of models to pull. Wire it into the install flow to replace the existing hard-coded pull loop.

**Tech Stack:** TypeScript, Vitest, oclif, Node.js `child_process.spawnSync`

---

## File Map

| File | Change |
|------|--------|
| `cli/src/commands/install.ts` | Export `OLLAMA_MODELS` + `selectOllamaModels`; replace pull loop with prompt + selective pull |
| `cli/test/commands/install.test.ts` | Add unit tests for `selectOllamaModels` |

---

### Task 1: Export `OLLAMA_MODELS` constant and `selectOllamaModels` function

**Files:**
- Modify: `cli/src/commands/install.ts`
- Test: `cli/test/commands/install.test.ts`

- [ ] **Step 1: Write failing tests for `selectOllamaModels`**

Open `cli/test/commands/install.test.ts` and add a new `describe` block after the existing `buildDefaultConfig` block:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { buildDefaultConfig, selectOllamaModels, OLLAMA_MODELS } from '../../src/commands/install.js'
```

Replace the existing import line (line 5) — add `selectOllamaModels, OLLAMA_MODELS` to the named imports.

Then add at the end of the file:

```typescript
describe('selectOllamaModels', () => {
  it('returns all models when user enters "a"', async () => {
    const result = await selectOllamaModels(async () => 'a')
    expect(result).toEqual(OLLAMA_MODELS)
  })

  it('returns first model when user enters "1"', async () => {
    const result = await selectOllamaModels(async () => '1')
    expect(result).toEqual(['qwen3:1.7b'])
  })

  it('returns second model when user enters "2"', async () => {
    const result = await selectOllamaModels(async () => '2')
    expect(result).toEqual(['qwen3:8b'])
  })

  it('returns third model when user enters "3"', async () => {
    const result = await selectOllamaModels(async () => '3')
    expect(result).toEqual(['nemotron-3-nano:4b'])
  })

  it('returns fourth model when user enters "4"', async () => {
    const result = await selectOllamaModels(async () => '4')
    expect(result).toEqual(['gemma4:e4b'])
  })

  it('returns empty array when user enters "0"', async () => {
    const result = await selectOllamaModels(async () => '0')
    expect(result).toEqual([])
  })

  it('returns empty array when user enters blank', async () => {
    const result = await selectOllamaModels(async () => '')
    expect(result).toEqual([])
  })

  it('returns empty array when user enters invalid input', async () => {
    const result = await selectOllamaModels(async () => 'x')
    expect(result).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/sinthetix/Agency/cli && npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: tests fail with `selectOllamaModels is not exported` or similar.

- [ ] **Step 3: Export `OLLAMA_MODELS` and `selectOllamaModels` from `install.ts`**

In `cli/src/commands/install.ts`, add the following after the existing exports (after the `buildDefaultConfig` function, around line 77):

```typescript
export const OLLAMA_MODELS = ['qwen3:1.7b', 'qwen3:8b', 'nemotron-3-nano:4b', 'gemma4:e4b']

export async function selectOllamaModels(
  promptFn: (question: string) => Promise<string>,
): Promise<string[]> {
  console.log('')
  console.log('Select Ollama models to pull:')
  OLLAMA_MODELS.forEach((m, i) => console.log(`  ${i + 1}) ${m}`))
  console.log('  a) All models')
  console.log('  0) None — skip for now')
  console.log('')
  const choice = await promptFn('Choice [1/2/3/4/a/0]: ')
  if (choice === 'a') return [...OLLAMA_MODELS]
  const idx = parseInt(choice, 10)
  if (idx >= 1 && idx <= OLLAMA_MODELS.length) return [OLLAMA_MODELS[idx - 1]]
  return []
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /home/sinthetix/Agency/cli && npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: all tests pass including the 8 new `selectOllamaModels` tests.

- [ ] **Step 5: Commit**

```bash
cd /home/sinthetix/Agency/cli
git add src/commands/install.ts test/commands/install.test.ts
git commit -m "feat: export selectOllamaModels for optional Ollama model selection"
```

---

### Task 2: Wire `selectOllamaModels` into the install flow

**Files:**
- Modify: `cli/src/commands/install.ts` — replace pull loop (lines ~749–771) with prompt + selective pull

- [ ] **Step 1: Replace the model pull block in the `run()` method**

Find this block in the `run()` method (starts after `this.log(chalk.green(' ready'))`):

```typescript
        this.log(chalk.green(' ready'))
        const ollamaModels = ['qwen3:1.7b', 'qwen3:8b', 'nemotron-3-nano:4b', 'gemma4:e4b']
        const modelCheck = spawnSync(
          'docker', ['exec', 'agency-ollama', 'ollama', 'list'],
          { stdio: 'pipe' }
        )
        const modelList = modelCheck.stdout?.toString() ?? ''
        for (const model of ollamaModels) {
          if (modelList.includes(model)) {
            this.log(chalk.gray(`  Ollama model ${model} already present, skipping download.`))
          } else {
            this.log(chalk.gray(`  Pulling Ollama model ${model} (this may take a moment)...`))
            const ollamaPullResult = spawnSync(
              'docker', ['exec', 'agency-ollama', 'ollama', 'pull', model],
              { stdio: 'inherit' }
            )
            if (ollamaPullResult.status !== 0) {
              this.warn(`Ollama model pull failed — run \`docker exec agency-ollama ollama pull ${model}\` manually after install.`)
            } else {
              this.log(chalk.green(`  ${model} ready.`))
            }
          }
        }
```

Replace it with:

```typescript
        this.log(chalk.green(' ready'))
        const selectedModels = await selectOllamaModels((q) => prompt(rl, q))
        if (selectedModels.length === 0) {
          this.log(chalk.gray('  Skipping model pulls. Pull any time: agency models pull <model>'))
          this.log(chalk.gray('  Available: ' + OLLAMA_MODELS.join(', ')))
        } else {
          const modelCheck = spawnSync(
            'docker', ['exec', 'agency-ollama', 'ollama', 'list'],
            { stdio: 'pipe' }
          )
          const modelList = modelCheck.stdout?.toString() ?? ''
          for (const model of selectedModels) {
            if (modelList.includes(model)) {
              this.log(chalk.gray(`  Ollama model ${model} already present, skipping download.`))
            } else {
              this.log(chalk.gray(`  Pulling Ollama model ${model} (this may take a moment)...`))
              const ollamaPullResult = spawnSync(
                'docker', ['exec', 'agency-ollama', 'ollama', 'pull', model],
                { stdio: 'inherit' }
              )
              if (ollamaPullResult.status !== 0) {
                this.warn(`Ollama model pull failed — run \`docker exec agency-ollama ollama pull ${model}\` manually after install.`)
              } else {
                this.log(chalk.green(`  ${model} ready.`))
              }
            }
          }
        }
```

- [ ] **Step 2: Build to confirm TypeScript compiles**

```bash
cd /home/sinthetix/Agency/cli && npm run build 2>&1 | tail -10
```

Expected: no errors, exits 0.

- [ ] **Step 3: Run full test suite**

```bash
cd /home/sinthetix/Agency/cli && npm test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd /home/sinthetix/Agency/cli
git add src/commands/install.ts
git commit -m "feat: make Ollama model pulls optional during install"
```

- [ ] **Step 5: Push**

```bash
cd /home/sinthetix/Agency && git push
```
