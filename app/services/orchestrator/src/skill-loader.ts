// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { ActiveSkill } from '@agency/shared-types'

export interface SkillLoadResult {
  validSkills: ActiveSkill[]
  skippedSkills: Array<{ skill: ActiveSkill; reason: string }>
  betaHeaders: string[]
}

export function loadSkillsForSession(
  skills: ActiveSkill[],
  profileAllowedTools: string[]
): SkillLoadResult {
  const validSkills: ActiveSkill[] = []
  const skippedSkills: Array<{ skill: ActiveSkill; reason: string }> = []

  for (const skill of skills) {
    const missing = (skill.manifest.requiredTools ?? []).filter(
      (t: string) => !profileAllowedTools.includes(t)
    )
    if (missing.length > 0) {
      const reason = `Missing requiredTools: ${missing.join(', ')}`
      console.warn(`[skills] Skipping '${skill.name}': ${reason}`)
      skippedSkills.push({ skill, reason })
    } else {
      validSkills.push(skill)
    }
  }

  const betaHeaders = [
    ...new Set(
      validSkills
        .filter((s) => s.anthropicBetaHeader)
        .map((s) => s.anthropicBetaHeader!)
    ),
  ]

  return { validSkills, skippedSkills, betaHeaders }
}
