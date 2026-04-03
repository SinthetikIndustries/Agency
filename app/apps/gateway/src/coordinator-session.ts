// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { buildCoordinatorSystemPrompt } from '@agency/orchestrator'

/**
 * Returns the system injection string for a coordinator session.
 * Merges with any existing injection (e.g. first-run bootstrap).
 * Returns undefined when coordinatorMode is false.
 */
export function getCoordinatorInjection(
  coordinatorMode: boolean,
  workerSlugs: string[],
  existingInjection?: string,
): string | undefined {
  if (!coordinatorMode) return undefined
  const coordinatorPrompt = buildCoordinatorSystemPrompt(workerSlugs)
  return existingInjection
    ? `${existingInjection}\n\n${coordinatorPrompt}`
    : coordinatorPrompt
}
