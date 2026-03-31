// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect } from 'vitest'
import { parseSchedule } from '../schedule-parser.js'

describe('parseSchedule natural language time validation', () => {
  it('accepts valid time every day at 9am', () => {
    expect(() => parseSchedule('every day at 9am', 'recurring')).not.toThrow()
  })

  it('rejects hour > 23', () => {
    expect(() => parseSchedule('every day at 25:00', 'recurring')).toThrow(/invalid.*time/i)
  })

  it('rejects minute > 59', () => {
    expect(() => parseSchedule('every day at 9:99', 'recurring')).toThrow(/invalid.*time/i)
  })

  it('rejects hour == 24', () => {
    expect(() => parseSchedule('every day at 24:00', 'recurring')).toThrow(/invalid.*time/i)
  })
})
