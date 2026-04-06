// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { ToolContext } from '@agency/shared-types'

export interface BrainStore {
  gatewayUrl: string    // e.g. 'http://localhost:2002'
  apiKey: string
}

export function createBrainHandlers(store: BrainStore) {
  async function brainFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${store.gatewayUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': store.apiKey,
        ...init?.headers,
      },
    })
    if (!res.ok) throw new Error(`Brain API error ${res.status}: ${await res.text()}`)
    return res.json() as Promise<T>
  }

  return {
    async brain_read(
      input: Record<string, unknown>,
      _ctx: ToolContext
    ): Promise<unknown> {
      const nodeId = input['node_id'] as string
      if (!nodeId) throw new Error('node_id required')
      return brainFetch(`/brain/nodes/${nodeId}`)
    },

    async brain_write(
      input: Record<string, unknown>,
      ctx: ToolContext
    ): Promise<unknown> {
      const { node_id, label, type, content, metadata, confidence } = input as {
        node_id?: string
        label?: string
        type?: string
        content?: string
        metadata?: Record<string, unknown>
        confidence?: number
      }
      const source = `agent:${ctx.agentId}`

      if (node_id) {
        // Update existing node
        if (!label && !content && !type && !confidence && !metadata) {
          throw new Error('At least one field to update is required')
        }
        return brainFetch(`/brain/nodes/${node_id}`, {
          method: 'PUT',
          body: JSON.stringify({ label, type, content, metadata, confidence, source }),
        })
      }

      // Create new node
      if (!label) throw new Error('label required to create a node')
      return brainFetch('/brain/nodes', {
        method: 'POST',
        body: JSON.stringify({ label, type: type ?? 'concept', content, metadata, confidence: confidence ?? 1.0, source }),
      })
    },

    async brain_relate(
      input: Record<string, unknown>,
      ctx: ToolContext
    ): Promise<unknown> {
      const { from_id, to_id, type, weight, bidirectional } = input as {
        from_id?: string
        to_id?: string
        type?: string
        weight?: number
        bidirectional?: boolean
      }
      if (!from_id || !to_id) throw new Error('from_id and to_id required')
      const source = `agent:${ctx.agentId}`
      return brainFetch('/brain/edges', {
        method: 'POST',
        body: JSON.stringify({
          from_id, to_id,
          type: type ?? 'references',
          weight: weight ?? 1.0,
          bidirectional: bidirectional ?? false,
          source,
        }),
      })
    },

    async brain_search(
      input: Record<string, unknown>,
      _ctx: ToolContext
    ): Promise<unknown> {
      const query = input['query'] as string
      const limit = Math.min(Number(input['limit'] ?? 20) || 20, 50)
      const type = input['type'] as string | undefined
      if (!query) throw new Error('query required')

      const params = new URLSearchParams({ q: query, limit: String(limit) })
      if (type) params.set('type', type)
      return brainFetch(`/brain/search?${params}`)
    },

    async brain_traverse(
      input: Record<string, unknown>,
      _ctx: ToolContext
    ): Promise<unknown> {
      const nodeId = input['node_id'] as string
      const depth = Math.min(Number(input['depth'] ?? 2) || 2, 5)
      if (!nodeId) throw new Error('node_id required')
      return brainFetch(`/brain/traverse/${nodeId}?depth=${depth}`)
    },
  }
}
