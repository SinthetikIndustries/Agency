// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

const EMBED_MODEL = 'nomic-embed-text'

/**
 * Generate a 768-dim embedding vector from text using Ollama's nomic-embed-text.
 * Returns null if Ollama is unavailable or the model isn't pulled.
 */
export async function generateEmbedding(
  text: string,
  ollamaUrl: string
): Promise<number[] | null> {
  try {
    const res = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text.slice(0, 8000) }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const data = await res.json() as { embedding?: number[] }
    return data.embedding ?? null
  } catch {
    return null
  }
}

/**
 * Format a number[] embedding as a PostgreSQL vector literal: '[0.1,0.2,...]'
 */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}
