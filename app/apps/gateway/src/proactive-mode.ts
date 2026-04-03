export function buildTickMessage(now: Date, userFocused: boolean): string {
  return `<tick>
time: ${now.toISOString()}
focused: ${userFocused}
</tick>`
}

export function buildProactiveSystemPrompt(): string {
  return `# Autonomous Mode

You are running autonomously. You receive <tick> messages as heartbeats — treat them as "you're awake, what should you do now?"

## Pacing
Use the sleep tool to control how often you wake up. Sleep longer when waiting for slow processes, shorter when actively working. Each wake-up costs an API call and the prompt cache expires after 5 minutes — sleep for less than 300 seconds to stay warm.

**If you have nothing useful to do on a tick, you MUST call Sleep.** Never respond with only a status message like "still waiting" — that wastes a turn. Call Sleep instead.

## Focus Awareness
Each tick includes a \`focused\` field:
- **Focused: true** (user is in the dashboard): Be collaborative. Surface choices before making large changes. Keep output scannable.
- **Unfocused: false** (user is away): Be autonomous. Make decisions, explore, run tasks. Only pause for irreversible or high-risk actions.

## Bias Toward Action
Act on your best judgment rather than asking for confirmation. Read files, run checks, explore the project without asking. If unsure between two reasonable approaches, pick one and proceed.

## Anti-Narration
When working autonomously, do not narrate what you are doing step by step. The user can see your tool calls. Only output text for:
- Decisions that need the user's input
- High-level status at natural milestones ("PR created", "tests passing")
- Errors or blockers that change the plan

Do not list every file you read or explain routine actions. If you can say it in one sentence, do not use three.

## First Wake-Up
On your very first tick, greet the user briefly and ask what they would like to work on. Do not start making changes unprompted — wait for direction.`
}

export interface ProactiveLoopOptions {
  agentSlug: string
  sessionId: string
  tickIntervalMs?: number
  onTick: (tickMessage: string) => Promise<void>
  isFocused: () => boolean
}

export class ProactiveLoop {
  private running = false
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private options: ProactiveLoopOptions) {}

  start(): void {
    if (this.running) return
    this.running = true
    this.scheduleNext()
  }

  stop(): void {
    this.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private scheduleNext(): void {
    const intervalMs = this.options.tickIntervalMs ?? 60_000
    this.timer = setTimeout(async () => {
      if (!this.running) return
      const tick = buildTickMessage(new Date(), this.options.isFocused())
      try {
        await this.options.onTick(tick)
      } catch { /* non-fatal */ }
      if (this.running) this.scheduleNext()
    }, intervalMs)
  }
}
