import type { Page } from "playwright";
import { selectors } from "./selectors.js";

const DETECT_TIMEOUT_MS = 8000;

export async function needsLogin(page: Page): Promise<boolean> {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  const loginVisible = await page
    .locator(selectors.login.userName)
    .first()
    .isVisible()
    .catch(() => false);
  if (loginVisible) return true;
  const dashboardVisible = await page
    .locator(selectors.navigation.internationalTab)
    .first()
    .isVisible()
    .catch(() => false);
  if (dashboardVisible) return false;
  const modalVisible = await page
    .locator(selectors.modal.closeButton)
    .first()
    .isVisible()
    .catch(() => false);
  if (modalVisible) return false;
  const race = await Promise.race([
    page
      .waitForSelector(selectors.login.userName, {
        state: "visible",
        timeout: DETECT_TIMEOUT_MS,
      })
      .then(() => true),
    page
      .waitForSelector(selectors.navigation.internationalTab, {
        state: "visible",
        timeout: DETECT_TIMEOUT_MS,
      })
      .then(() => false),
    page
      .waitForSelector(selectors.modal.closeButton, {
        state: "visible",
        timeout: DETECT_TIMEOUT_MS,
      })
      .then(() => false),
  ]).catch(() => true);
  return race;
}
