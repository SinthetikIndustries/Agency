// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { BaseWorker } from '@agency/shared-worker'
import type { Job } from 'bullmq'
import { chromium } from 'playwright'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrowserJob {
  url: string
  action: 'fetch' | 'screenshot' | 'extract'
  selector?: string
  waitForSelector?: string
  timeout?: number
}

interface FetchResult {
  url: string
  html: string
  text: string
  title: string
}

interface ScreenshotResult {
  url: string
  screenshot: string // base64 PNG
}

interface ExtractResult {
  url: string
  html: string
  text: string
}

type BrowserResult = FetchResult | ScreenshotResult | ExtractResult

// ─── Worker ───────────────────────────────────────────────────────────────────

export class BrowserWorker extends BaseWorker {
  constructor() {
    super('agency:browser' as any, 1)
  }

  protected async processJob(job: Job): Promise<BrowserResult> {
    const data = job.data as BrowserJob
    const { url, action, selector, waitForSelector, timeout = 30000 } = data

    const browser = await chromium.launch({ headless: true })

    try {
      const context = await browser.newContext()
      const page = await context.newPage()
      page.setDefaultTimeout(timeout)

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout })

      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { timeout })
      }

      switch (action) {
        case 'fetch': {
          const html = await page.content()
          const text = await page.evaluate(() => document.body.innerText)
          const title = await page.title()
          return { url, html, text, title } satisfies FetchResult
        }

        case 'screenshot': {
          const buffer = await page.screenshot({ type: 'png', fullPage: true })
          const screenshot = buffer.toString('base64')
          return { url, screenshot } satisfies ScreenshotResult
        }

        case 'extract': {
          if (!selector) {
            throw new Error('extract action requires a selector')
          }
          await page.waitForSelector(selector, { timeout })
          const html = await page.$eval(selector, (el) => el.innerHTML)
          const text = await page.$eval(
            selector,
            (el) => (el as HTMLElement).innerText ?? el.textContent ?? ''
          )
          return { url, html, text } satisfies ExtractResult
        }

        default: {
          throw new Error(`Unknown browser action: ${action}`)
        }
      }
    } finally {
      await browser.close()
    }
  }
}

// ─── Factory & Entry Point ────────────────────────────────────────────────────

export async function startBrowserWorker(): Promise<BrowserWorker> {
  const worker = new BrowserWorker()
  await worker.start()
  console.log('[agency:browser] Browser worker ready')
  return worker
}

startBrowserWorker().catch((err) => {
  console.error('[agency:browser] Fatal startup error:', err)
  process.exit(1)
})
