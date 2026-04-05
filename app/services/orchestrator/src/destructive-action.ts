// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { randomUUID } from 'node:crypto'
import type { DatabaseClient } from './db.js'
import type { ModelRouter } from '@agency/model-router'
import type { ToolContext } from '@agency/shared-types'

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

export interface DestructiveActionRequest {
  commands?: string[]
  affectedPaths?: string[]
  operationType: 'shell' | 'file_delete' | 'agent_create' | 'agent_delete' | 'group_create' | 'group_update' | 'group_delete' | 'group_member_add' | 'group_member_remove' | 'workspace_remove'
  description?: string  // human-readable description of the action
}

export interface ApprovalCreatedResult {
  approvalId: string
  explanation: string
  reasoning: string
  riskLevel: RiskLevel
}

export class DestructiveActionService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly modelRouter: ModelRouter,
  ) {}

  /**
   * Runs a concurrent fast-model side-query to generate explanation, reasoning, and riskLevel.
   * Used for enriching approval records shown to users.
   */
  async runSideQuery(ctx: ToolContext, request: DestructiveActionRequest): Promise<{ explanation: string; reasoning: string; riskLevel: RiskLevel }> {
    try {
      const response = await this.modelRouter.complete({
        model: this.modelRouter.resolveModel('cheap'),
        messages: [{
          role: 'user',
          content: `You are classifying a destructive action for a human reviewer.

Operation type: ${request.operationType}
${request.commands?.length ? `Commands: ${request.commands.join('; ')}` : ''}
${request.affectedPaths?.length ? `Affected paths: ${request.affectedPaths.join(', ')}` : ''}
${request.description ? `Description: ${request.description}` : ''}
Agent: ${ctx.agentId}

Respond with ONLY this JSON (no markdown):
{
  "explanation": "Plain-English description of what this action will do (1-2 sentences, present tense)",
  "reasoning": "Why the agent is doing this, starting with 'I' (1 sentence, derived from operation context)",
  "riskLevel": "LOW|MEDIUM|HIGH"
}`,
        }],
        maxTokens: 200,
      })

      const text = typeof response.content === 'string'
        ? response.content
        : (response.content as Array<{ type: string; text?: string }>).map(b => b.text ?? '').join('')

      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        return {
          explanation: String(parsed.explanation ?? ''),
          reasoning: String(parsed.reasoning ?? ''),
          riskLevel: (['LOW', 'MEDIUM', 'HIGH'].includes(parsed.riskLevel) ? parsed.riskLevel : 'MEDIUM') as RiskLevel,
        }
      }
    } catch {
      // Side-query failure is non-fatal
    }
    return { explanation: '', reasoning: '', riskLevel: 'MEDIUM' }
  }

  /**
   * Creates an approval record with enriched explanation from a concurrent side-query.
   * Used by tool handlers that return pending_approval to the calling agent.
   */
  async createApprovalRecord(
    ctx: ToolContext,
    request: DestructiveActionRequest,
    prompt: string,
  ): Promise<ApprovalCreatedResult> {
    const approvalId = randomUUID()

    // Run side-query concurrently with approval record insertion
    const [sideQuery] = await Promise.all([
      this.runSideQuery(ctx, request),
      this.db.execute(
        `INSERT INTO approvals (id, agent_id, session_id, prompt, tool_name, tool_input, status, risk_level, explanation, requested_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', 'MEDIUM', '', NOW())`,
        [approvalId, ctx.agentId, ctx.sessionId, prompt, request.operationType, JSON.stringify(request)]
      ),
    ])

    // Update with enriched data from side-query
    await this.db.execute(
      'UPDATE approvals SET explanation=$1, risk_level=$2 WHERE id=$3',
      [sideQuery.explanation, sideQuery.riskLevel, approvalId]
    )

    return { approvalId, ...sideQuery }
  }

  /**
   * Polls the approvals table for resolution.
   * Used by the orchestrator run() loop after yielding an approval_pending event.
   */
  async pollApproval(approvalId: string): Promise<'approved' | 'rejected' | 'expired'> {
    const POLL_MS = 500
    const TIMEOUT_MS = 10 * 60 * 1000
    const deadline = Date.now() + TIMEOUT_MS
    while (Date.now() < deadline) {
      await new Promise<void>(resolve => setTimeout(resolve, POLL_MS))
      const row = await this.db.queryOne<{ status: string }>(
        'SELECT status FROM approvals WHERE id=$1', [approvalId]
      )
      const s = row?.status
      if (s === 'approved') return 'approved'
      if (s === 'rejected') return 'rejected'
      if (s === 'expired') return 'expired'
    }
    await this.db.execute(
      'UPDATE approvals SET status=\'expired\', resolved_at=NOW() WHERE id=$1', [approvalId]
    )
    return 'expired'
  }

  /**
   * Full confirm flow for autonomous agent decisions.
   * In autonomous mode: writes to audit_log and returns 'auto_approved'.
   * In supervised mode: creates approval record (with side-query) and polls.
   * This is for use in non-generator contexts (group_delete, workspace_remove routes).
   */
  async confirm(ctx: ToolContext, request: DestructiveActionRequest): Promise<'approved' | 'rejected' | 'auto_approved'> {
    if (ctx.autonomousMode) {
      await this.db.execute(
        `INSERT INTO audit_log (id, action, actor, target_type, details, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [randomUUID(), `auto_approved.${request.operationType}`, ctx.agentId, request.operationType, JSON.stringify({
          auto_approved_destructive: true,
          commands: request.commands,
          affectedPaths: request.affectedPaths,
        })]
      )
      return 'auto_approved'
    }

    const prompt = request.description
      ?? `${request.operationType}${request.commands?.length ? `: ${request.commands[0]}` : ''}`
    const { approvalId } = await this.createApprovalRecord(ctx, request, prompt)
    const result = await this.pollApproval(approvalId)
    if (result === 'approved') return 'approved'
    return 'rejected'
  }
}
