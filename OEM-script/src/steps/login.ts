import type { Page } from 'playwright';
import type { Config } from '../config.js';
import { selectors } from '../selectors.js';

const { login: s } = selectors;

export async function login(page: Page, config: Config): Promise<void> {
  await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: config.navigationTimeout });

  await page.waitForSelector(s.userName, { state: 'visible', timeout: config.timeout });
  await page.fill(s.userName, config.username);
  await page.fill(s.password, config.password);

  const submit = page.locator(s.submit).first();
  await submit.click();

  await page.waitForLoadState('networkidle').catch(() => {});
  const internationalTab = selectors.navigation.internationalTab;
  const modal = selectors.modal.closeButton;
  await Promise.race([
    page.waitForSelector(internationalTab, { state: 'visible', timeout: config.timeout }),
    page.waitForSelector(modal, { state: 'visible', timeout: config.timeout }),
  ]);
}
