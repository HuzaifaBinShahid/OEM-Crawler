import type { Page } from "playwright";
import { sleep } from "../utils/sleep.js";
import { selectors } from "../selectors.js";

export interface BuildSheetRow {
  grp?: string;
  unit?: string;
  description?: string;
  [key: string]: string | undefined;
}

export interface ExtractedData {
  vin: string;
  model: string;
  engine: string;
  transmission: string;
  buildSheet: BuildSheetRow[];
  parts: Array<{ sku?: string; description?: string; section?: string }>;
  rawHTML?: string;
  scrapedAt: string;
}

const { buildSummary: sumSel, buildList: listSel } = selectors;

export async function extractBuildSheet(page: Page): Promise<ExtractedData> {
  const scrapedAt = new Date().toISOString();
  let vin = "";
  let model = "";
  let engine = "";
  let transmission = "";
  const buildSheet: BuildSheetRow[] = [];
  const parts: Array<{ sku?: string; description?: string; section?: string }> =
    [];

  const summarySection = page.locator(sumSel.container).first();
  const summaryVisible = await summarySection.isVisible().catch(() => false);
  if (summaryVisible) {
    const table = summarySection.locator("..").locator("table").first();
    const tableVisible = await table.isVisible().catch(() => false);
    if (tableVisible) {
      const rows = await table.locator("tr").all();
      for (const row of rows) {
        const cells = await row.locator("td, th").allTextContents();
        if (cells.length >= 2) {
          const key = cells[0]!.trim().replace(/\s*:\s*$/, "");
          const value = cells[1]!.trim();
          buildSheet.push({ [key]: value } as BuildSheetRow);
          if (/vin|vehicle.*number/i.test(key)) vin = value;
          if (/model/i.test(key) && !/engine/i.test(key)) model = value;
          if (/engine/i.test(key)) engine = value;
          if (/transmission/i.test(key)) transmission = value;
        } else if (cells.length === 1 && cells[0]?.trim()) {
          buildSheet.push({ raw: cells[0].trim() } as BuildSheetRow);
        }
      }
    }
  }

  const listSection = page.locator(listSel.container).first();
  const listVisible = await listSection.isVisible().catch(() => false);
  if (listVisible) {
    const table = listSection.locator("..").locator("table").first();
    const tableVisible = await table.isVisible().catch(() => false);
    if (tableVisible) {
      const changeLengthSelect = page.locator(listSel.paginationSelect).first();
      const selectVisible = await changeLengthSelect
        .isVisible()
        .catch(() => false);
      if (selectVisible) {
        await changeLengthSelect.selectOption("50").catch(() => {});
        await sleep(500);
      }

      let hasNext = true;
      while (hasNext) {
        const rows = await table.locator("tbody tr").all();
        for (const row of rows) {
          const tds = await row.locator("td").allTextContents();
          if (tds.length >= 3) {
            buildSheet.push({
              grp: tds[0]?.trim(),
              unit: tds[1]?.trim(),
              description: tds[2]?.trim(),
            });
            parts.push({
              sku: tds[1]?.trim(),
              description: tds[2]?.trim(),
              section: tds[0]?.trim(),
            });
          }
        }

        const nextBtn = page.locator(listSel.paginationNext).first();
        const nextVisible = await nextBtn.isVisible().catch(() => false);
        const nextDisabled = nextVisible
          ? await nextBtn
              .getAttribute("class")
              .then((c) => /disabled/.test(c ?? ""))
          : true;
        if (!nextVisible || nextDisabled) {
          hasNext = false;
        } else {
          await nextBtn.click();
          await sleep(400);
        }
      }
    }
  }

  if (!vin && buildSheet.length > 0) {
    const first = buildSheet.find(
      (r) => r.vin || (r as Record<string, string>)["VIN NUMBER"],
    );
    if (first)
      vin = (first as Record<string, string>)["VIN NUMBER"] ?? first.vin ?? "";
  }

  let rawHTML: string | undefined;
  try {
    rawHTML = await page.content();
  } catch {
    // ignore
  }

  return {
    vin,
    model,
    engine,
    transmission,
    buildSheet,
    parts,
    rawHTML,
    scrapedAt,
  };
}
