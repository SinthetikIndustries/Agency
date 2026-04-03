// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect } from 'vitest'
import { getCoordinatorInjection } from './coordinator-session.js'

describe('getCoordinatorInjection', () => {
  it('returns undefined when coordinatorMode is false', () => {
    expect(getCoordinatorInjection(false, ['researcher', 'developer'])).toBeUndefined()
  })

  it('returns coordinator prompt when coordinatorMode is true', () => {
    const result = getCoordinatorInjection(true, ['researcher', 'developer'])
    expect(result).toBeDefined()
    expect(result).toContain('researcher')
    expect(result).toContain('developer')
    expect(result).toContain('Synthesis')
    expect(result).toContain('Verification')
  })

  it('handles empty worker list', () => {
    const result = getCoordinatorInjection(true, [])
    expect(result).toBeDefined()
    expect(result).toContain('No worker agents')
  })

  it('merges coordinator prompt with existing injection', () => {
    const existing = 'First run: set up your workspace'
    const result = getCoordinatorInjection(true, ['researcher'], existing)
    expect(result).toContain('First run:')
    expect(result).toContain('researcher')
    expect(result).toContain('Synthesis')
  })

  it('returns just coordinator prompt when no existing injection', () => {
    const result = getCoordinatorInjection(true, ['dev'], undefined)
    expect(result).not.toContain('First run:')
    expect(result).toContain('dev')
  })
})
