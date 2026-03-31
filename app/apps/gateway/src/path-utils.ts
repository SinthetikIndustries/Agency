// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { sep } from 'node:path'

/**
 * Returns true only if `targetPath` is the workspace root itself
 * or is nested inside it. Prevents prefix-sharing traversal attacks
 * (e.g. workspace="/foo/bar" must not allow "/foo/bar-evil").
 */
export function isInsideWorkspace(workspace: string, targetPath: string): boolean {
  return targetPath === workspace || targetPath.startsWith(workspace + sep)
}
