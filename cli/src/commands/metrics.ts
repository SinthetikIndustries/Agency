// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import { loadGatewayConnection } from '../lib/gateway.js'

export default class Metrics extends Command {
  static summary = 'Print Prometheus metrics from the gateway'

  async run(): Promise<void> {
    const { url, apiKey } = await loadGatewayConnection()
    let res: Response
    try {
      res = await fetch(`${url}/metrics`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })
    } catch (err) {
      this.error(`Cannot connect to Gateway: ${String(err)}`)
    }

    if (!res.ok) this.error(`Gateway ${res.status}`)
    this.log(await res.text())
  }
}
