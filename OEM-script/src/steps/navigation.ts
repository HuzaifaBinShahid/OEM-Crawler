import type { Page } from 'playwright';
import { sleep } from '../utils/sleep.js';
import { selectors } from '../selectors.js';

const { navigation: s } = selectors;
const TAB_AND_BUTTON_TIMEOUT = 15000;

export async function goToPartSearch(page: Page): Promise<void> {
  const internationalTab = page.locator(s.internationalTab).first();
  await internationalTab.waitFor({ state: 'visible', timeout: TAB_AND_BUTTON_TIMEOUT });
  await internationalTab.click();
  await sleep(500);

  const beginButton = page.locator(s.beginPartSearchButton);
  await beginButton.waitFor({ state: 'visible', timeout: TAB_AND_BUTTON_TIMEOUT });
  await beginButton.click();
  await page.waitForSelector(selectors.vinForm.cartName, { state: 'visible', timeout: TAB_AND_BUTTON_TIMEOUT });
}
