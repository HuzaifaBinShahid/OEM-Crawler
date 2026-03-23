import type { Page } from 'playwright';
import { sleep } from '../utils/sleep.js';
import { selectors } from '../selectors.js';

const { onCommand: s } = selectors;

export async function openDetailList(page: Page): Promise<void> {
  const detailTab = page.locator(s.detailListTabText).or(page.locator(s.detailListTab)).first();
  await detailTab.waitFor({ state: 'visible', timeout: 15000 });
  await detailTab.click();
  await sleep(800);
  await page.waitForSelector('table tbody tr', { state: 'visible', timeout: 10000 }).catch(() => {});
}
