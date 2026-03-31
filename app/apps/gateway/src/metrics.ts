// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

/**
 * Simple in-process Prometheus-format metrics collector.
 * No external dependency — renders text/plain; version=0.0.4 format directly.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

type Labels = Record<string, string>

interface CounterState {
  type: 'counter'
  help: string
  values: Map<string, number>
}

interface GaugeState {
  type: 'gauge'
  help: string
  values: Map<string, number>
}

type MetricState = CounterState | GaugeState

// ─── Registry ─────────────────────────────────────────────────────────────────

class MetricsRegistry {
  private metrics = new Map<string, MetricState>()

  private labelsKey(labels: Labels): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
      .join(',')
  }

  counter(name: string, help: string): Counter {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, { type: 'counter', help, values: new Map() })
    }
    return new Counter(name, this)
  }

  gauge(name: string, help: string): Gauge {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, { type: 'gauge', help, values: new Map() })
    }
    return new Gauge(name, this)
  }

  inc(name: string, labels: Labels, by = 1): void {
    const m = this.metrics.get(name)
    if (!m) return
    const key = this.labelsKey(labels)
    m.values.set(key, (m.values.get(key) ?? 0) + by)
  }

  set(name: string, labels: Labels, value: number): void {
    const m = this.metrics.get(name)
    if (!m) return
    m.values.set(this.labelsKey(labels), value)
  }

  render(): string {
    const lines: string[] = []
    for (const [name, state] of this.metrics) {
      lines.push(`# HELP ${name} ${state.help}`)
      lines.push(`# TYPE ${name} ${state.type}`)
      if (state.values.size === 0) {
        lines.push(`${name} 0`)
      } else {
        for (const [labelStr, value] of state.values) {
          const labelPart = labelStr ? `{${labelStr}}` : ''
          lines.push(`${name}${labelPart} ${value}`)
        }
      }
    }
    return lines.join('\n') + '\n'
  }
}

class Counter {
  constructor(private readonly name: string, private readonly registry: MetricsRegistry) {}

  inc(labels: Labels = {}, by = 1): void {
    this.registry.inc(this.name, labels, by)
  }
}

class Gauge {
  constructor(private readonly name: string, private readonly registry: MetricsRegistry) {}

  set(value: number, labels: Labels = {}): void {
    this.registry.set(this.name, labels, value)
  }

  inc(labels: Labels = {}, by = 1): void {
    this.registry.inc(this.name, labels, by)
  }
}

// ─── Global Registry ──────────────────────────────────────────────────────────

export const registry = new MetricsRegistry()

// ─── Metric Definitions ───────────────────────────────────────────────────────

export const metrics = {
  // HTTP requests
  httpRequestsTotal: registry.counter(
    'agency_http_requests_total',
    'Total HTTP requests received'
  ),
  httpRequestDurationMs: registry.gauge(
    'agency_http_request_duration_ms',
    'HTTP request duration in milliseconds'
  ),

  // Sessions
  sessionsTotal: registry.counter(
    'agency_sessions_total',
    'Total sessions created'
  ),
  sessionsActive: registry.gauge(
    'agency_sessions_active',
    'Currently active sessions'
  ),

  // Agent run loop
  agentRunsTotal: registry.counter(
    'agency_agent_runs_total',
    'Total agent run loop executions'
  ),
  agentRunIterations: registry.counter(
    'agency_agent_run_iterations_total',
    'Total agentic loop iterations across all runs'
  ),

  // Tool calls
  toolCallsTotal: registry.counter(
    'agency_tool_calls_total',
    'Total tool calls dispatched'
  ),
  toolCallErrorsTotal: registry.counter(
    'agency_tool_call_errors_total',
    'Total tool call errors'
  ),

  // Approval gates
  approvalsTotal: registry.counter(
    'agency_approvals_total',
    'Total approval requests created'
  ),
  approvalOutcomesTotal: registry.counter(
    'agency_approval_outcomes_total',
    'Total approval outcomes by decision'
  ),

  // Skills
  skillsInstalled: registry.gauge(
    'agency_skills_installed',
    'Number of installed skills'
  ),

  // Memory
  memoryWritesTotal: registry.counter(
    'agency_memory_writes_total',
    'Total memory entries written'
  ),

  // Uptime
  uptimeSeconds: registry.gauge(
    'agency_uptime_seconds',
    'Gateway uptime in seconds'
  ),
}
