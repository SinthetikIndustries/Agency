// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect } from 'vitest'
import { isInsideWorkspace } from '../path-utils.js'

describe('isInsideWorkspace', () => {
  it('allows a path inside the workspace', () => {
    const ws = '/home/user/.agency/agents/main'
    expect(isInsideWorkspace(ws, ws + '/subdir/file.txt')).toBe(true)
  })

  it('rejects a path that shares the workspace prefix', () => {
    const ws = '/home/user/.agency/agents/main'
    expect(isInsideWorkspace(ws, '/home/user/.agency/agents/main-evil/secret.txt')).toBe(false)
  })

  it('allows the workspace root itself', () => {
    const ws = '/home/user/.agency/agents/main'
    expect(isInsideWorkspace(ws, ws)).toBe(true)
  })

  it('rejects a path completely outside the workspace', () => {
    const ws = '/home/user/.agency/agents/main'
    expect(isInsideWorkspace(ws, '/etc/passwd')).toBe(false)
  })
})
