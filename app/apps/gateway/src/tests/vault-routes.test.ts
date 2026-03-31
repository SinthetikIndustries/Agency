// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect } from 'vitest'

function escapeLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

describe('escapeLike', () => {
  it('escapes percent signs', () => {
    expect(escapeLike('100%')).toBe('100\\%')
  })

  it('escapes underscores', () => {
    expect(escapeLike('file_name')).toBe('file\\_name')
  })

  it('escapes backslashes first', () => {
    expect(escapeLike('a\\b')).toBe('a\\\\b')
  })

  it('leaves normal strings unchanged', () => {
    expect(escapeLike('hello world')).toBe('hello world')
  })
})
