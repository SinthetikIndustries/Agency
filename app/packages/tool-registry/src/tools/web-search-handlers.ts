// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { ToolHandler, ToolManifest } from '../index.js'

export const WEB_SEARCH_MANIFEST: ToolManifest = {
  name: 'web_search',
  type: 'http',
  description:
    'Search the web using multiple search engines simultaneously (Bing, DuckDuckGo, Brave). Returns a list of results with titles, URLs, and snippets. No API key required.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      count: { type: 'number', description: 'Number of results (1–50, default 10)' },
      engines: {
        type: 'array',
        items: { type: 'string' },
        description: 'Search engines to use (optional)',
      },
    },
    required: ['query'],
  },
  permissions: ['http:external'],
  sandboxed: false,
  timeout: 30_000,
}

export const FETCH_WEB_CONTENT_MANIFEST: ToolManifest = {
  name: 'fetch_web_content',
  type: 'http',
  description: 'Fetch the full text content of a public web page or document at a URL.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Public HTTP/HTTPS URL to fetch' },
    },
    required: ['url'],
  },
  permissions: ['http:external'],
  sandboxed: false,
  timeout: 30_000,
}

export function createWebSearchHandlers(webSearchBaseUrl: string): {
  searchHandler: ToolHandler
  fetchHandler: ToolHandler
} {
  const searchHandler: ToolHandler = async (input) => {
    const { query, count, engines } = input as { query: string; count?: number; engines?: string[] }
    const body: Record<string, unknown> = { query, count: count ?? 10 }
    if (engines?.length) body.engines = engines
    const res = await fetch(`${webSearchBaseUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`web_search failed: ${res.status}`)
    return res.json()
  }

  const fetchHandler: ToolHandler = async (input) => {
    const { url } = input as { url: string }
    const res = await fetch(`${webSearchBaseUrl}/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    if (!res.ok) throw new Error(`fetch_web_content failed: ${res.status}`)
    return res.json()
  }

  return { searchHandler, fetchHandler }
}
