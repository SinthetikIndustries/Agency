// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

/**
 * Split a long message into chunks at word or line boundaries.
 * @param text - The full message text.
 * @param maxLength - Maximum characters per chunk.
 */
export function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text]
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    // Try to split at a newline boundary
    const slice = remaining.slice(0, maxLength)
    const lastNewline = slice.lastIndexOf('\n')
    const cutAt = lastNewline > maxLength / 2 ? lastNewline + 1 : maxLength
    chunks.push(remaining.slice(0, cutAt).trimEnd())
    remaining = remaining.slice(cutAt).trimStart()
  }
  return chunks.filter(Boolean)
}
