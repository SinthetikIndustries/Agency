// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const agencyDir = join(homedir(), '.agency')
export const configPath = join(agencyDir, 'config.json')
export const credentialsPath = join(agencyDir, 'credentials.json')

export async function readConfig(): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(configPath, 'utf8')
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function writeConfig(config: Record<string, unknown>): Promise<void> {
  await mkdir(agencyDir, { recursive: true })
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8')
  await chmod(configPath, 0o644)
}

export async function readCredentials(): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(credentialsPath, 'utf8')
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function writeCredentials(creds: Record<string, unknown>): Promise<void> {
  await mkdir(agencyDir, { recursive: true })
  await writeFile(credentialsPath, JSON.stringify(creds, null, 2), 'utf8')
  await chmod(credentialsPath, 0o600)
}

export function getNestedValue(obj: Record<string, unknown>, dotPath: string): unknown {
  const parts = dotPath.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export function setNestedValue(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const parts = dotPath.split('.')
  let current: Record<string, unknown> = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (
      current[part] === null ||
      current[part] === undefined ||
      typeof current[part] !== 'object'
    ) {
      current[part] = {}
    }
    current = current[part] as Record<string, unknown>
  }
  current[parts[parts.length - 1]] = value
}

export async function isFirstRun(): Promise<boolean> {
  try {
    const config = await readConfig()
    return (config as Record<string, unknown>).firstRun === true
  } catch {
    return false
  }
}

export async function clearFirstRun(): Promise<void> {
  const config = await readConfig()
  ;(config as Record<string, unknown>).firstRun = false
  await writeConfig(config)
}

export function parseConfigValue(str: string): unknown {
  if (str === 'true') return true
  if (str === 'false') return false
  if (str.startsWith('[') || str.startsWith('{')) {
    try {
      return JSON.parse(str)
    } catch {
      return str
    }
  }
  const num = Number(str)
  if (!Number.isNaN(num) && str.trim() !== '') return num
  return str
}
