import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';

export interface ScreenshotOptions {
  dir: string;
  name?: string;
  suffix?: string;
}

export async function takeScreenshot(
  page: Page,
  options: ScreenshotOptions
): Promise<string | null> {
  const { dir, name = 'scrape', suffix = '' } = options;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeSuffix = suffix ? `_${suffix.replace(/[^a-zA-Z0-9-_]/g, '_')}` : '';
  const filename = `${timestamp}_${name}${safeSuffix}.png`;
  const filePath = path.join(dir, filename);
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    await page.screenshot({ path: filePath, fullPage: true });
    return path.resolve(filePath);
  } catch (err) {
    console.error('[screenshot] Failed to save screenshot:', err);
    return null;
  }
}
