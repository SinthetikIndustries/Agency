import { describe, it, expect } from 'vitest'
import { buildTickMessage, buildProactiveSystemPrompt } from './proactive-mode.js'

describe('buildTickMessage', () => {
  it('includes a tick tag with the current time', () => {
    const tick = buildTickMessage(new Date('2026-04-02T14:30:00Z'), false)
    expect(tick).toContain('<tick>')
    expect(tick).toContain('2026-04-02')
  })

  it('includes focus state', () => {
    const focused = buildTickMessage(new Date(), true)
    const unfocused = buildTickMessage(new Date(), false)
    expect(focused).toContain('focused: true')
    expect(unfocused).toContain('focused: false')
  })
})

describe('buildProactiveSystemPrompt', () => {
  it('includes bias toward action and anti-narration rules', () => {
    const prompt = buildProactiveSystemPrompt()
    expect(prompt).toContain('call Sleep')
    expect(prompt).toContain('do not narrate')
    expect(prompt).toContain('Unfocused')
    expect(prompt).toContain('Focused')
  })
})
