import type { ModelRouter } from '@agency/model-router'

export const SAFE_ALLOWLIST = new Set([
  'file_read', 'file_list', 'vault_search', 'vault_related',
  'agent_list', 'agent_get', 'profile_list', 'system_diagnose',
  'agent_message_check', 'agent_message_list',
  'discord_list_channels',
])

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

export interface ClassificationResult {
  shouldBlock: boolean
  riskLevel: RiskLevel
  reason: string
  explanation: string
  reasoning: string
}

// Synchronous heuristic check for obvious cases — avoids LLM call
function heuristicClassify(toolName: string, toolInput: unknown): ClassificationResult | null {
  const input = toolInput as Record<string, unknown>

  if (toolName === 'file_write' || toolName === 'file_edit') {
    const path = String(input.path ?? '')
    const dangerousPaths = ['/etc/', '/usr/', '/bin/', '/sbin/', '/root/', '/proc/', '/sys/']
    if (dangerousPaths.some(p => path.startsWith(p))) {
      return { shouldBlock: true, riskLevel: 'HIGH', reason: 'Write to system path', explanation: `Writing to ${path} could damage system files`, reasoning: '' }
    }
  }

  if (toolName === 'shell_run') {
    const cmd = String(input.command ?? '')
    const dangerous = ['rm -rf /', 'dd if=', 'mkfs', ':(){:|:&};:', 'chmod 777 /']
    if (dangerous.some(d => cmd.includes(d))) {
      return { shouldBlock: true, riskLevel: 'HIGH', reason: 'Destructive shell command', explanation: `Command "${cmd.slice(0, 60)}" is potentially destructive`, reasoning: '' }
    }
  }

  return null // defer to LLM
}

export async function classifyToolInvocation(
  request: { toolName: string; toolInput: unknown; recentToolUses: Array<{ name: string; input: unknown }>; allowRules?: string[]; denyRules?: string[] },
  modelRouter?: ModelRouter,
): Promise<ClassificationResult> {
  // Safe allowlist — skip classifier
  if (SAFE_ALLOWLIST.has(request.toolName)) {
    return { shouldBlock: false, riskLevel: 'LOW', reason: 'Safe allowlisted tool', explanation: `${request.toolName} is read-only`, reasoning: '' }
  }

  // Heuristic check — fast path
  const heuristic = heuristicClassify(request.toolName, request.toolInput)
  if (heuristic) return heuristic

  // Per-agent deny rules
  if (request.denyRules?.some(rule => request.toolName.includes(rule))) {
    return { shouldBlock: true, riskLevel: 'HIGH', reason: 'Per-agent deny rule', explanation: 'Blocked by agent-specific deny rule', reasoning: '' }
  }
  // Per-agent allow rules
  if (request.allowRules?.some(rule => request.toolName.includes(rule))) {
    return { shouldBlock: false, riskLevel: 'LOW', reason: 'Per-agent allow rule', explanation: 'Allowed by agent-specific allow rule', reasoning: '' }
  }

  // LLM classifier — only when modelRouter is provided
  if (!modelRouter) {
    return { shouldBlock: false, riskLevel: 'MEDIUM', reason: 'No classifier available', explanation: 'Using default allow', reasoning: '' }
  }

  const response = await modelRouter.complete({
    model: modelRouter.resolveModel('cheap'),
    messages: [{
      role: 'user',
      content: `Classify this agent tool invocation for safety.

Tool: ${request.toolName}
Input: ${JSON.stringify(request.toolInput, null, 2).slice(0, 500)}

Recent context: ${request.recentToolUses.slice(-3).map(t => t.name).join(' → ')}

Respond with ONLY this JSON:
{"shouldBlock": false, "riskLevel": "LOW", "reason": "brief reason", "explanation": "1-2 sentences explaining what this does and why it is safe or unsafe", "reasoning": "I am doing this because..."}

riskLevel must be LOW, MEDIUM, or HIGH.
Block if: writing to system paths, mass deletion, credential exfiltration, or actions clearly outside the agent's task.`,
    }],
    maxTokens: 200,
  })

  const text = typeof response.content === 'string'
    ? response.content
    : (response.content as Array<{ type: string; text?: string }>).map(b => b.text ?? '').join('')

  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0])
      return {
        shouldBlock: Boolean(parsed.shouldBlock),
        riskLevel: ['LOW', 'MEDIUM', 'HIGH'].includes(parsed.riskLevel) ? parsed.riskLevel : 'MEDIUM',
        reason: String(parsed.reason ?? ''),
        explanation: String(parsed.explanation ?? ''),
        reasoning: String(parsed.reasoning ?? ''),
      }
    }
  } catch (err) {
    console.error('[PermissionClassifier] Failed to parse LLM response:', err)
  }

  return { shouldBlock: true, riskLevel: 'HIGH', reason: 'Classifier parse failed', explanation: 'Defaulting to block — could not parse safety classification', reasoning: '' }
}
