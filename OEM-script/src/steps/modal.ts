import type { Page } from "playwright";
import { selectors } from "../selectors.js";

const POST_LOGIN_MODAL_WAIT_MS = 4000;
const ONCOMMAND_MODAL_WAIT_MS = 4000;

export async function closePostLoginModal(page: Page): Promise<void> {
  const closeBtn = page.locator(selectors.modal.closeButton).first();
  try {
    await closeBtn.waitFor({ state: "visible", timeout: POST_LOGIN_MODAL_WAIT_MS });
    await closeBtn.click();
    await page
      .waitForSelector(selectors.modal.closeButton, {
        state: "hidden",
        timeout: 2000,
      })
      .catch(() => {});
  } catch {
  }
}

export async function closeOnCommandMessageModal(page: Page): Promise<void> {
  const closeBtn = page.locator(selectors.onCommand.messageModalClose).first();
  try {
    await closeBtn.waitFor({
      state: "visible",
      timeout: ONCOMMAND_MODAL_WAIT_MS,
    });
    await closeBtn.click();
    await page
      .waitForSelector(selectors.onCommand.messageModalClose, {
        state: "hidden",
        timeout: 2000,
      })
      .catch(() => {});
  } catch {
    // Modal may not appear
  }
}
