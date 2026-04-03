// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect } from 'vitest'
import { buildCoordinatorSystemPrompt, isCoordinatorMessage } from './coordinator.js'

describe('buildCoordinatorSystemPrompt', () => {
  it('includes the 4-phase workflow', () => {
    const prompt = buildCoordinatorSystemPrompt([])
    expect(prompt).toContain('Research')
    expect(prompt).toContain('Synthesis')
    expect(prompt).toContain('Implementation')
    expect(prompt).toContain('Verification')
  })

  it('lists available worker agent names', () => {
    const prompt = buildCoordinatorSystemPrompt(['researcher', 'developer'])
    expect(prompt).toContain('researcher')
    expect(prompt).toContain('developer')
  })

  it('mentions no workers when list is empty', () => {
    const prompt = buildCoordinatorSystemPrompt([])
    expect(prompt).toContain('No worker agents')
  })
})

describe('isCoordinatorMessage', () => {
  it('detects task-notification messages', () => {
    expect(isCoordinatorMessage('<task-notification><task-id>x</task-id>')).toBe(true)
  })

  it('returns false for normal conversation text', () => {
    expect(isCoordinatorMessage('Hello, how can I help?')).toBe(false)
  })

  it('handles leading whitespace', () => {
    expect(isCoordinatorMessage('  \n<task-notification>')).toBe(true)
  })
})
