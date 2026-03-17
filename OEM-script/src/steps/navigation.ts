import type { Page } from 'playwright';
import type { Config } from '../config.js';
import { selectors } from '../selectors.js';
import { sleep } from '../utils/sleep.js';

const { navigation: s } = selectors;
const TAB_AND_BUTTON_TIMEOUT = 15000;

export async function goToPartSearch(page: Page, config: Config): Promise<void> {
  const formVisible = await page.locator(selectors.vinForm.cartName).first().isVisible().catch(() => false);
  if (formVisible) return;

  await page.goto(config.partSearchUrl, { waitUntil: 'domcontentloaded', timeout: config.navigationTimeout });
  await page.waitForSelector(selectors.vinForm.cartName, { state: 'visible', timeout: TAB_AND_BUTTON_TIMEOUT });
}
