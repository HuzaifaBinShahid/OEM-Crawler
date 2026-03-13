import type { Page } from 'playwright';
import { selectors } from '../selectors.js';
import { sleep } from '../utils/sleep.js';

const { vinForm: s } = selectors;
const FORM_VISIBLE_TIMEOUT = 5000;
const OPEN_CATALOG_TIMEOUT = 5000;
const CATALOG_PAGE_OPEN_TIMEOUT = 12000;

export interface VinFormInput {
  cartName: string;
  vin: string;
}

export async function submitVinSearch(page: Page, input: VinFormInput): Promise<Page> {
  await page.waitForSelector(s.searchBlock, { state: 'visible', timeout: FORM_VISIBLE_TIMEOUT });
  await page.waitForSelector(s.cartName, { state: 'visible', timeout: FORM_VISIBLE_TIMEOUT });

  await page.locator(s.cartName).fill(input.cartName);
  await page.locator(s.vinInput).fill(input.vin);
  await sleep(300);

  const openCatalogBtn = page.locator(s.openCatalogButton);
  await openCatalogBtn.waitFor({ state: 'visible', timeout: OPEN_CATALOG_TIMEOUT });
  const enabledAt = Date.now() + OPEN_CATALOG_TIMEOUT;
  while (Date.now() < enabledAt) {
    const disabled = await openCatalogBtn.getAttribute('disabled').catch(() => null);
    if (!disabled) break;
    await sleep(400);
  }

  const [newPageOrResponse] = await Promise.all([
    page.context().waitForEvent('page', { timeout: CATALOG_PAGE_OPEN_TIMEOUT }).catch(() => null),
    openCatalogBtn.click(),
  ]);

  if (newPageOrResponse) {
    return newPageOrResponse;
  }

  await page.waitForURL(/navistar|oncommand|oecnpc/i, { timeout: CATALOG_PAGE_OPEN_TIMEOUT }).catch(() => {});
  return page;
}
