// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args } from '@oclif/core'
import { gatewayFetch } from '../../../lib/gateway.js'

export default class AgentsWorkspaceGet extends Command {
  static summary = 'Read a file from an agent workspace'

  static args = {
    slug: Args.string({ description: 'Agent slug', required: true }),
    path: Args.string({ description: 'File path relative to workspace (e.g. identity.md)', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(AgentsWorkspaceGet)
    try {
      const res = await gatewayFetch<{ path: string; content: string }>(
        `/agents/${args.slug}/workspace/file?path=${encodeURIComponent(args.path)}`
      )
      this.log(res.content)
    } catch (err) {
      this.error(String(err))
    }
  }
}
