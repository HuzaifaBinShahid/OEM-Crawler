import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { takeScreenshot } from './screenshot.js';

export interface ErrorContext {
  step?: string;
  page?: Page;
  url?: string;
  vin?: string;
  cartName?: string;
  skuQuery?: string;
  screenshotsDir: string;
  logsDir: string;
}

const SCREENSHOT_TIMEOUT_MS = 4000;

export async function logScraperError(error: unknown, context: ErrorContext): Promise<void> {
  const { step, page, url, vin, cartName, skuQuery, screenshotsDir, logsDir } = context;
  const err = error instanceof Error ? error : new Error(String(error));
  const timestamp = new Date().toISOString();
  const logName = `error_${timestamp.replace(/[:.]/g, '-').slice(0, 19)}.log`;
  const logPath = path.join(logsDir, logName);

  let screenshotPath: string | null = null;
  if (page) {
    try {
      screenshotPath = await Promise.race([
        takeScreenshot(page, {
          dir: screenshotsDir,
          name: 'error',
          suffix: step || 'scrape',
        }),
        new Promise<string | null>((_, reject) =>
          setTimeout(() => reject(new Error('Screenshot timeout')), SCREENSHOT_TIMEOUT_MS)
        ),
      ]);
    } catch {
      screenshotPath = null;
    }
  }

  const lines = [
    `[${timestamp}] Scraper error`,
    `Step: ${step ?? 'unknown'}`,
    `Message: ${err.message}`,
    ...(url ? [`URL: ${url}`] : []),
    ...(vin ? [`VIN: ${vin}`] : []),
    ...(cartName ? [`Cart: ${cartName}`] : []),
    ...(skuQuery != null && skuQuery !== '' ? [`SkuQuery: ${skuQuery}`] : []),
    ...(screenshotPath ? [`Screenshot: ${screenshotPath}`] : []),
    '',
    'Stack:',
    err.stack ?? '(no stack)',
  ];
  // Full error details stay in log only; never sent to API client
  const content = lines.join('\n');

  try {
    await fs.promises.mkdir(logsDir, { recursive: true });
    await fs.promises.writeFile(logPath, content, 'utf8');
  } catch (writeErr) {
    console.error('[error-handler] Failed to write error log:', writeErr);
  }
}
