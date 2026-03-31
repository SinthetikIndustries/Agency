// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { CronExpressionParser } from 'cron-parser'
import cronstrue from 'cronstrue'

type ScheduleType = 'recurring' | 'once'

interface ParseResult {
  schedule: string
  type: ScheduleType
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
}

function parseTime(timeStr: string): { h: number; m: number } {
  const s = timeStr.trim().toLowerCase()
  const match = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/)
  if (!match) throw new Error(`Cannot parse time: ${timeStr}`)
  let h = parseInt(match[1]!, 10)
  const m = parseInt(match[2] ?? '0', 10)
  const meridiem = match[3]
  if (meridiem === 'pm' && h < 12) h += 12
  if (meridiem === 'am' && h === 12) h = 0
  if (h < 0 || h > 23) throw new Error(`Invalid time: hour ${h} is out of range (0–23)`)
  if (m < 0 || m > 59) throw new Error(`Invalid time: minute ${m} is out of range (0–59)`)
  return { h, m }
}

function tryNaturalLanguage(input: string): string | null {
  const s = input.trim().toLowerCase()

  for (const [day, num] of Object.entries(WEEKDAYS)) {
    if (s.startsWith(`every ${day} at `)) {
      const { h, m } = parseTime(s.slice(`every ${day} at `.length))
      return `${m} ${h} * * ${num}`
    }
  }

  const everyDayAt = s.match(/^every day at (.+)$/)
  if (everyDayAt) {
    const { h, m } = parseTime(everyDayAt[1]!)
    return `${m} ${h} * * *`
  }

  const firstOf = s.match(/^first of every month at (.+)$/)
  if (firstOf) {
    const { h, m } = parseTime(firstOf[1]!)
    return `${m} ${h} 1 * *`
  }

  const lastDay = s.match(/^last day of every month at (.+)$/)
  if (lastDay) {
    const { h, m } = parseTime(lastDay[1]!)
    // Try 'L' (last day), fall back to '28-31' range if not supported
    const withL = `${m} ${h} L * *`
    try {
      CronExpressionParser.parse(withL)
      return withL
    } catch {
      return `${m} ${h} 28-31 * *`
    }
  }

  const everyNHours = s.match(/^every (\d+) hours?$/)
  if (everyNHours) {
    return `0 */${everyNHours[1]} * * *`
  }

  const everyNMinutes = s.match(/^every (\d+) minutes?$/)
  if (everyNMinutes) {
    return `*/${everyNMinutes[1]} * * * *`
  }

  return null
}

export function parseSchedule(input: string, type: ScheduleType): ParseResult {
  const trimmed = input.trim()

  if (type === 'once') {
    // Require ISO 8601 format to avoid accepting arbitrary date strings
    if (!/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
      throw new Error(`Invalid datetime for one-off task: "${trimmed}". Provide an ISO 8601 datetime string (e.g. "2026-05-01T09:00:00.000Z").`)
    }
    const d = new Date(trimmed)
    if (!isNaN(d.getTime())) {
      return { schedule: d.toISOString(), type: 'once' }
    }
    throw new Error(`Invalid datetime for one-off task: "${trimmed}". Provide an ISO 8601 datetime string.`)
  }

  // Try valid cron expression first
  try {
    CronExpressionParser.parse(trimmed)
    return { schedule: trimmed, type }
  } catch {
    // not a cron expression — try natural language
  }

  const natural = tryNaturalLanguage(trimmed)
  if (natural) {
    try {
      CronExpressionParser.parse(natural)
      return { schedule: natural, type }
    } catch {
      throw new Error(`Parsed "${trimmed}" to "${natural}" but it is not a valid cron expression`)
    }
  }

  throw new Error(
    `Cannot parse schedule: "${trimmed}". ` +
    `Use a cron expression (e.g. "0 9 * * 1") or natural language ` +
    `(e.g. "every monday at 9am", "every day at 6pm", "first of every month at 8am").`
  )
}

export function toHumanReadable(schedule: string, type: ScheduleType): string {
  if (type === 'once') {
    const d = new Date(schedule)
    return `Once — ${d.toLocaleString()}`
  }
  try {
    return cronstrue.toString(schedule)
  } catch {
    return schedule
  }
}

export function computeNextRun(schedule: string, type: ScheduleType): Date {
  if (type === 'once') {
    return new Date(schedule)
  }
  const interval = CronExpressionParser.parse(schedule)
  return interval.next().toDate()
}
