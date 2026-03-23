import { Buffer } from "node:buffer";
import type { Page } from "playwright";
import {
  getReferenceTextForPromptAsync,
  appendLearnedExample,
} from "../data/query-examples.js";
import {
  extractPartTermsFromQuery,
  pickCategory,
  pickNextSubcategory,
  pickSubcategories,
  pickTableRow,
  type TableRowOption,
} from "../services/ai-fallback.js";
import { sleep } from "../utils/sleep.js";
import { loadConfig } from "../config.js";
import { selectors } from "../selectors.js";
import { ScraperCancelledError } from "../scraper-cancelled-error.js";

const { onCommand: oc } = selectors;
const TREE_WAIT_MS = 6000;
const TABLE_WAIT_MS = 6000;
const MODAL_WAIT_MS = 6000;
const TABLE_READY_TIMEOUT_MS = 8000;
const DETAIL_LIST_TABLE_WAIT_MS = 120000;
const DETAIL_LIST_TBODY_WAIT_MS = 90000;
const DETAIL_LIST_TREE_WAIT_MS = 60000;
const DETAIL_LIST_RETRY_SLEEP_MS = 2000;
const DETAIL_LIST_MAX_TREE_RETRIES = 5;
const DETAIL_LIST_MAX_TABLE_RETRIES = 2;
const DETAIL_LIST_MAX_AI_PARENTS = 3;
const TABLE_STABILITY_MS = 400;
const OPTIONS_COL = 6;

async function waitForPartsTableReady(page: Page): Promise<void> {
  await Promise.race([
    page
      .locator(oc.partsTable)
      .locator("tbody tr")
      .first()
      .waitFor({ state: "visible", timeout: TABLE_READY_TIMEOUT_MS })
      .catch(() => {}),
    page
      .locator(oc.partsTable)
      .locator("td.dataTables_empty")
      .waitFor({ state: "visible", timeout: TABLE_READY_TIMEOUT_MS })
      .catch(() => {}),
    page
      .locator(oc.partsTablePaginate)
      .waitFor({ state: "visible", timeout: TABLE_READY_TIMEOUT_MS })
      .catch(() => {}),
  ]);
  await sleep(TABLE_STABILITY_MS);
}

async function waitForDetailListTableAndFilter(page: Page): Promise<void> {
  const filterInput = page.locator("#partsTable_filter input").first();
  await filterInput.waitFor({
    state: "visible",
    timeout: DETAIL_LIST_TABLE_WAIT_MS,
  });
  await sleep(300);
  await Promise.race([
    page
      .locator(oc.partsTable)
      .locator("tbody tr")
      .first()
      .waitFor({ state: "visible", timeout: DETAIL_LIST_TBODY_WAIT_MS })
      .catch(() => {}),
    page
      .locator(oc.partsTable)
      .locator("td.dataTables_empty")
      .waitFor({ state: "visible", timeout: DETAIL_LIST_TBODY_WAIT_MS })
      .catch(() => {}),
  ]);
  await sleep(TABLE_STABILITY_MS);
}

export interface PartRow {
  item?: string;
  partNumber: string;
  description: string;
  servicePartNumber?: string;
  requiredQuantity?: string;
  rowIndex?: number;
  figurePagePath?: string;
  figureImageUrl?: string;
}

function parseOpenSec2FigurePath(onclick: string | null): string | undefined {
  if (!onclick || typeof onclick !== "string") return undefined;
  const m = /openSec2\s*\(\s*'[^']*'\s*,\s*'([^']*)'/.exec(onclick);
  if (!m) return undefined;
  return m[1]!.replace(/&amp;/g, "&").trim() || undefined;
}

const FIGURE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

function candidateFigureImageUrls(
  figrFileNme: string,
  pageUrl: string,
  imageBase: string,
): string[] {
  const raw = figrFileNme.replace(/&amp;/g, "").trim();
  if (!raw) return [];
  const nav = imageBase.replace(/\/$/, "");
  let origin = "";
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    /* empty */
  }
  const candidates: string[] = [];
  const add = (u: string) => {
    if (u && !candidates.includes(u)) candidates.push(u);
  };
  // Strip leading /../ → path from site root (common API shape)
  const fromRoot = raw.replace(/^\/+\.\.\//, "/").replace(/^\/+/, "/");
  add(`${nav}${fromRoot.startsWith("/") ? fromRoot : `/${fromRoot}`}`);
  if (origin) {
    add(`${origin}${fromRoot.startsWith("/") ? fromRoot : `/${fromRoot}`}`);
    try {
      const chassis = new URL("/npc/myportal/ChassisArts", `${origin}/`);
      const resolved = new URL(raw.replace(/^\//, ""), chassis).href;
      add(resolved);
    } catch {
      /* empty */
    }
    try {
      const resolved2 = new URL(raw, `${origin}/npc/myportal/`).href;
      add(resolved2);
    } catch {
      /* empty */
    }
  }
  return candidates;
}

async function figureImageFileNameFromChassisArts(
  page: Page,
  figurePath: string,
  imageBase: string,
): Promise<string | undefined> {
  const path = figurePath.startsWith("/") ? figurePath : `/${figurePath}`;
  const bases: string[] = [];
  try {
    bases.push(new URL(page.url()).origin);
  } catch {
    /* empty */
  }
  bases.push(imageBase);
  const tried = new Set<string>();
  for (const b of bases) {
    const base = b.replace(/\/$/, "");
    if (tried.has(base)) continue;
    tried.add(base);
    const url = `${base}${path}`;
    try {
      const res = await page.context().request.get(url, {
        timeout: 20_000,
        headers: { Accept: "application/json, text/plain, */*" },
      });
      const text = (await res.text()).trim();
      if (!text.startsWith("[")) continue;
      const data = JSON.parse(text) as Array<{ figrFileNme?: string }>;
      const figrFileNme = Array.isArray(data) && data[0]?.figrFileNme;
      if (typeof figrFileNme === "string" && figrFileNme.trim())
        return figrFileNme.trim();
    } catch {
      continue;
    }
  }
  return undefined;
}

async function fetchFigureAsDataUrl(
  page: Page,
  pageUrl: string,
  imageBase: string,
  figrFileNme: string,
): Promise<string | undefined> {
  const candidates = candidateFigureImageUrls(figrFileNme, pageUrl, imageBase);
  for (const imageUrl of candidates) {
    try {
      const res = await page.context().request.get(imageUrl, {
        timeout: 25_000,
        headers: { Accept: "image/*,*/*" },
      });
      if (!res.ok()) continue;
      const headers = res.headers();
      const ct = (headers["content-type"] || headers["Content-Type"] || "")
        .split(";")[0]!
        .trim()
        .toLowerCase();
      if (!ct.startsWith("image/")) continue;
      const buf = Buffer.from(await res.body());
      if (buf.length === 0 || buf.length > FIGURE_IMAGE_MAX_BYTES) continue;
      const b64 = buf.toString("base64");
      return `data:${ct};base64,${b64}`;
    } catch {
      continue;
    }
  }
  return undefined;
}

async function enrichPartsFigureImages(
  page: Page,
  parts: PartRow[],
): Promise<void> {
  const imageBase = loadConfig().navistarPortalBaseUrl.replace(/\/$/, "");
  const pageUrl = page.url();
  const paths = [
    ...new Set(parts.map((p) => p.figurePagePath).filter(Boolean)),
  ] as string[];
  const pathToDisplayUrl = new Map<string, string>();
  for (const path of paths) {
    const figrFileNme = await figureImageFileNameFromChassisArts(
      page,
      path,
      imageBase,
    );
    if (!figrFileNme) continue;
    const dataUrl = await fetchFigureAsDataUrl(
      page,
      pageUrl,
      imageBase,
      figrFileNme,
    );
    if (dataUrl) pathToDisplayUrl.set(path, dataUrl);
  }
  for (const p of parts) {
    const u = p.figurePagePath
      ? pathToDisplayUrl.get(p.figurePagePath)
      : undefined;
    if (u) p.figureImageUrl = u;
  }
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function nodeTextMatches(nodeText: string, aiName: string): boolean {
  const n = normalize(nodeText);
  const a = normalize(aiName);
  if (!n || !a) return false;
  return n === a || n.includes(a) || a.includes(n);
}

type NodeInfo = {
  index: number;
  text: string;
  nodeId: string;
  hasExpandPlus: boolean;
  indentCount: number;
};

async function getTreeNodes(
  page: Page,
  treeWaitMs: number = TREE_WAIT_MS,
): Promise<NodeInfo[]> {
  await page.waitForSelector(oc.illustrationsList, {
    state: "visible",
    timeout: treeWaitMs,
  });
  await page.waitForSelector(oc.treeNode, {
    state: "visible",
    timeout: treeWaitMs,
  });
  await sleep(300);
  const nodes = await page.locator(oc.treeNode).all();
  const infos: NodeInfo[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const li = nodes[i]!;
    const text = (await li.innerText()).replace(/^[\s±−+]+/, "").trim();
    const nodeId = (await li.getAttribute("data-nodeid")) ?? "";
    const hasExpandPlus = await li
      .locator(oc.treeExpandIcon)
      .first()
      .isVisible()
      .catch(() => false);
    const indentCount = await li.locator("span.indent").count();
    infos.push({ index: i, text, nodeId, hasExpandPlus, indentCount });
  }
  return infos;
}

function getRootCategories(infos: NodeInfo[]): NodeInfo[] {
  if (infos.length <= 1) return [];
  const rest = infos.slice(1);
  const categoryIndent = rest[0]!.indentCount;
  return rest.filter((i) => i.indentCount === categoryIndent);
}

function getDirectChildren(
  infos: NodeInfo[],
  matchIndex: number,
  matchIndent: number,
): NodeInfo[] {
  const children: NodeInfo[] = [];
  for (let i = matchIndex + 1; i < infos.length; i++) {
    const info = infos[i]!;
    if (info.indentCount <= matchIndent) break;
    children.push(info);
  }
  return children;
}

async function scrapeAllTableRows(
  page: Page,
): Promise<{ parts: PartRow[]; relatedLinkRowIndices: number[] }> {
  const OPTIONS_COL_1 = OPTIONS_COL;

  const result = await page
    .evaluate((optionsCol) => {
      const rows = document.querySelectorAll("#partsTable tbody tr");
      const parts: Array<{
        item?: string;
        partNumber: string;
        description: string;
        servicePartNumber?: string;
        requiredQuantity?: string;
        rowIndex: number;
        figurePagePath?: string;
      }> = [];
      const relatedLinkRowIndices: number[] = [];
      const openSec2Re = /openSec2\s*\(\s*'[^']*'\s*,\s*'([^']*)'/;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] as HTMLTableRowElement;
        if (row.classList.contains("group")) continue;
        const empty = row.querySelector("td.dataTables_empty");
        if (empty) continue;
        const tds = row.querySelectorAll("td");
        if (tds.length < 4) continue;
        const rowText = row.innerText || "";
        if (/no matching records found/i.test(rowText)) continue;
        const partNumCell = tds[2];
        const link = partNumCell?.querySelector("a");
        let partNumber = (
          link?.textContent ||
          tds[2]?.textContent ||
          ""
        ).trim();
        const description = (tds[3]?.textContent || "").trim();
        const item = (tds[1]?.textContent || "").trim();
        const servicePartNumber =
          (tds[4]?.textContent || "").trim() || undefined;
        const requiredQuantity =
          tds.length > 6 ? (tds[6]?.textContent || "").trim() : undefined;
        let figurePagePath = undefined;
        const lastCell = tds[tds.length - 1];
        const figLink = lastCell?.querySelector('a[onclick*="openSec2"]');
        const onclick = (figLink || link)?.getAttribute("onclick");
        if (onclick && openSec2Re.test(onclick)) {
          const m = openSec2Re.exec(onclick);
          if (m)
            figurePagePath = m[1].replace(/&amp;/g, "&").trim() || undefined;
        }
        if (!partNumber && !description) continue;
        const hasRelated =
          row.querySelector(`td:nth-child(${optionsCol}) img.relatedURL`) !=
          null;
        parts.push({
          item: item || undefined,
          partNumber,
          description,
          servicePartNumber: servicePartNumber || undefined,
          requiredQuantity: requiredQuantity || undefined,
          rowIndex: i,
          figurePagePath,
        });
        if (hasRelated) relatedLinkRowIndices.push(i);
      }
      return { parts, relatedLinkRowIndices };
    }, OPTIONS_COL_1)
    .catch(() => null);

  if (result && Array.isArray(result.parts)) {
    return result as { parts: PartRow[]; relatedLinkRowIndices: number[] };
  }

  const rows = await page.locator(oc.partsTable).locator("tbody tr").all();
  const rowsOut: PartRow[] = [];
  const relatedLinkRowIndices: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const isEmptyCell = await row
      .locator("td.dataTables_empty")
      .isVisible()
      .catch(() => false);
    if (isEmptyCell) continue;
    const isHidden = await row
      .getAttribute("class")
      .then((c) => (c || "").includes("group"))
      .catch(() => false);
    if (isHidden) continue;
    const visible = await row.isVisible().catch(() => false);
    if (!visible) continue;
    const tds = await row.locator("td").allTextContents();
    if (tds.length < 4) continue;
    const rowText = await row.innerText().catch(() => "");
    if (/no matching records found/i.test(rowText)) continue;
    const item = tds[1]?.trim();
    const partNumCell = row.locator("td:nth-child(3)");
    const linkEl = partNumCell.locator("a").first();
    let partNumber = (await linkEl.innerText().catch(() => "")).trim();
    if (!partNumber) partNumber = tds[2]?.trim() ?? "";
    const figLinkEl = row
      .locator("td")
      .last()
      .locator('a[onclick*="openSec2"]')
      .first();
    let onclick = await figLinkEl.getAttribute("onclick").catch(() => null);
    if (!onclick)
      onclick = await linkEl.getAttribute("onclick").catch(() => null);
    const figurePagePath = parseOpenSec2FigurePath(onclick);
    const description = tds[3]?.trim() ?? "";
    const servicePartNumber = tds[4]?.trim() || undefined;
    const requiredQuantity = tds.length > 6 ? tds[6]?.trim() : undefined;
    if (partNumber || description) {
      rowsOut.push({
        item,
        partNumber,
        description,
        servicePartNumber,
        requiredQuantity,
        rowIndex: i,
        figurePagePath,
      });
      const relatedLink = row
        .locator(`td:nth-child(${OPTIONS_COL}) img.relatedURL`)
        .first();
      const hasLink = await relatedLink.isVisible().catch(() => false);
      if (hasLink) relatedLinkRowIndices.push(i);
    }
  }
  return { parts: rowsOut, relatedLinkRowIndices };
}

async function scrapeSearchTabTableRows(page: Page): Promise<PartRow[]> {
  const result = await page
    .evaluate(() => {
      const rows = document.querySelectorAll("#partsTable tbody tr");
      const parts: Array<{
        partNumber: string;
        description: string;
        servicePartNumber?: string;
        requiredQuantity?: string;
        rowIndex: number;
        figurePagePath?: string;
      }> = [];
      const openSec2Re = /openSec2\s*\(\s*'[^']*'\s*,\s*'([^']*)'/;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] as HTMLTableRowElement;
        if (row.classList.contains("group")) continue;
        const empty = row.querySelector("td.dataTables_empty");
        if (empty) continue;
        const tds = row.querySelectorAll("td");
        if (tds.length < 3) continue;
        const rowText = row.innerText || "";
        if (/no matching records found/i.test(rowText)) continue;
        const partNumCell = tds[1];
        const partLink = partNumCell?.querySelector("a");
        const partNumber = (
          partLink?.textContent ||
          tds[1]?.textContent ||
          ""
        ).trim();
        const description = (tds[2]?.textContent || "").trim();
        const servicePartNumber =
          (tds[3]?.textContent || "").trim() || undefined;
        const requiredQuantity =
          tds.length > 4 ? (tds[4]?.textContent || "").trim() : undefined;
        let figurePagePath = undefined;
        const lastCell = tds[tds.length - 1];
        const figLink = lastCell?.querySelector('a[onclick*="openSec2"]');
        const onclick = (figLink || partLink)?.getAttribute("onclick");
        if (onclick && openSec2Re.test(onclick)) {
          const m = openSec2Re.exec(onclick);
          if (m)
            figurePagePath = m[1].replace(/&amp;/g, "&").trim() || undefined;
        }
        if (!partNumber && !description) continue;
        parts.push({
          partNumber,
          description,
          servicePartNumber: servicePartNumber || undefined,
          requiredQuantity: requiredQuantity || undefined,
          rowIndex: i,
          figurePagePath,
        });
      }
      return parts;
    })
    .catch(() => null);
  if (result && Array.isArray(result)) return result as PartRow[];
  return [];
}

function formatWordSearchForEitherOrBoth(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return trimmed;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return trimmed;
  return words.map((w) => w.trim()).join(", ");
}

export async function findPartViaSearchTab(
  page: Page,
  query: string,
  onStatus?: (message: string) => void,
): Promise<{ parts: PartRow[]; noMatch: boolean }> {
  const status = (msg: string) => {
    console.log("[part-search]", msg);
    onStatus?.(msg);
  };
  const q = query.trim();
  if (!q) return { parts: [], noMatch: false };

  const words = q.split(/\s+/).filter(Boolean);
  const isMultiWord = words.length >= 2;
  const wordSearchQuery = isMultiWord ? formatWordSearchForEitherOrBoth(q) : q;

  status("Moving to search page...");
  const searchTab = page.locator(oc.searchTab).first();
  await searchTab.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  await searchTab.click();
  await sleep(500);

  const wordSearch = page.locator(oc.wordSearch).first();
  await wordSearch.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  await wordSearch.fill(wordSearchQuery);
  status(
    isMultiWord
      ? "Writing words in search bar (either or both)..."
      : "Writing in search bar...",
  );
  await page.locator(oc.wordSearchButton).first().click();
  await sleep(600);

  await waitForPartsTableReady(page);
  status("Looking in table...");
  const filterInput = page.locator(oc.partsTableFilter).first();
  await filterInput
    .waitFor({ state: "visible", timeout: 5000 })
    .catch(() => {});
  let effectiveFilter: string;
  if (isMultiWord) {
    effectiveFilter = "";
  } else {
    await filterInput.fill(q);
    effectiveFilter = q;
  }
  await sleep(500);

  const emptyCell = page
    .locator(oc.partsTable)
    .locator("td.dataTables_empty")
    .first();
  const emptyVisible = await emptyCell.isVisible().catch(() => false);
  if (emptyVisible) {
    const emptyText = await emptyCell.textContent().catch(() => "");
    if (/no matching records found/i.test(emptyText ?? "")) {
      if (isMultiWord) {
        status("No matches found for this record.");
        return { parts: [], noMatch: true };
      }
      if (words.length >= 2) {
        status("No matches found. Trying another combination...");
        const firstHalf = words[0]!;
        const secondHalf = words.slice(1).join(" ");
        await filterInput.fill("");
        await sleep(300);
        status("Trying first part of query...");
        await filterInput.fill(firstHalf);
        await sleep(500);
        const emptyFirst = await page
          .locator(oc.partsTable)
          .locator("td.dataTables_empty")
          .first()
          .isVisible()
          .catch(() => false);
        const emptyFirstText = emptyFirst
          ? await page
              .locator(oc.partsTable)
              .locator("td.dataTables_empty")
              .first()
              .textContent()
              .catch(() => "")
          : "";
        if (
          emptyFirst &&
          /no matching records found/i.test(emptyFirstText ?? "")
        ) {
          status("No matches with first part. Trying second part...");
          await filterInput.fill("");
          await sleep(300);
          await filterInput.fill(secondHalf);
          await sleep(500);
          const emptySecond = await page
            .locator(oc.partsTable)
            .locator("td.dataTables_empty")
            .first()
            .isVisible()
            .catch(() => false);
          const emptySecondText = emptySecond
            ? await page
                .locator(oc.partsTable)
                .locator("td.dataTables_empty")
                .first()
                .textContent()
                .catch(() => "")
            : "";
          if (
            emptySecond &&
            /no matching records found/i.test(emptySecondText ?? "")
          ) {
            status("No matches found for this record.");
            return { parts: [], noMatch: true };
          }
          effectiveFilter = secondHalf;
          status("Found results with second part of query.");
        } else {
          effectiveFilter = firstHalf;
          status("Found results with first part of query.");
        }
      } else {
        if (
          words.length === 1 &&
          words[0]!.length > 1 &&
          words[0]!.toLowerCase().endsWith("s")
        ) {
          const singular = words[0]!.slice(0, -1);
          status("No matches found. Trying singular...");
          await filterInput.fill("");
          await sleep(300);
          await filterInput.fill(singular);
          await sleep(500);
          const emptySingular = await page
            .locator(oc.partsTable)
            .locator("td.dataTables_empty")
            .first()
            .isVisible()
            .catch(() => false);
          const emptySingularText = emptySingular
            ? await page
                .locator(oc.partsTable)
                .locator("td.dataTables_empty")
                .first()
                .textContent()
                .catch(() => "")
            : "";
          if (
            emptySingular &&
            /no matching records found/i.test(emptySingularText ?? "")
          ) {
            status("No matches found for this record.");
            return { parts: [], noMatch: true };
          }
          effectiveFilter = singular;
        } else {
          status("No matches found for this record.");
          return { parts: [], noMatch: true };
        }
      }
    }
  }

  const collectedParts: PartRow[] = [];
  const seenPartNumbers = new Set<string>();

  const addPicked = (picked: PartRow[]) => {
    for (const p of picked) {
      const key = p.partNumber.trim();
      if (!seenPartNumbers.has(key)) {
        seenPartNumbers.add(key);
        collectedParts.push(p);
      }
    }
  };

  let pageNum = 1;
  for (;;) {
    const pageParts = await scrapeSearchTabTableRows(page);
    if (pageParts.length === 0 && pageNum === 1)
      return { parts: [], noMatch: false };
    if (pageParts.length === 0) break;
    addPicked(pageParts);

    if (!(await hasNextPartsTablePage(page))) break;
    pageNum++;
    status(`Moving to page ${pageNum}...`);
    const nextOk = await goToNextPartsTablePage(page);
    if (!nextOk) break;
    await filterInput.fill(effectiveFilter);
    await sleep(400);
  }

  await enrichPartsFigureImages(page, collectedParts);

  return { parts: collectedParts, noMatch: false };
}

export async function searchAgainOnSamePage(
  page: Page,
  term: string,
  onStatus?: (message: string) => void,
): Promise<{ parts: PartRow[]; noMatch: boolean }> {
  const status = (msg: string) => {
    console.log("[part-search]", msg);
    onStatus?.(msg);
  };
  const q = term.trim();
  if (!q) return { parts: [], noMatch: false };

  const words = q.split(/\s+/).filter(Boolean);
  const isMultiWord = words.length >= 2;
  const wordSearchQuery = isMultiWord ? formatWordSearchForEitherOrBoth(q) : q;

  const wordSearch = page.locator(oc.wordSearch).first();
  await wordSearch.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  status("Clearing search bar and searching for next part...");
  await wordSearch.fill("");
  await sleep(300);
  await wordSearch.fill(wordSearchQuery);
  await page.locator(oc.wordSearchButton).first().click();
  await sleep(600);

  await waitForPartsTableReady(page);
  const filterInput = page.locator(oc.partsTableFilter).first();
  await filterInput
    .waitFor({ state: "visible", timeout: 5000 })
    .catch(() => {});
  const effectiveFilter = isMultiWord ? "" : q;
  if (!isMultiWord) {
    await filterInput.fill(q);
  }
  await sleep(500);

  const emptyCell = page
    .locator(oc.partsTable)
    .locator("td.dataTables_empty")
    .first();
  const emptyVisible = await emptyCell.isVisible().catch(() => false);
  if (emptyVisible) {
    const emptyText = await emptyCell.textContent().catch(() => "");
    if (/no matching records found/i.test(emptyText ?? "")) {
      status("No matches found for this part.");
      return { parts: [], noMatch: true };
    }
  }

  const collectedParts: PartRow[] = [];
  const seenPartNumbers = new Set<string>();
  const addPicked = (picked: PartRow[]) => {
    for (const p of picked) {
      const key = p.partNumber.trim();
      if (!seenPartNumbers.has(key)) {
        seenPartNumbers.add(key);
        collectedParts.push(p);
      }
    }
  };

  let pageNum = 1;
  for (;;) {
    const pageParts = await scrapeSearchTabTableRows(page);
    if (pageParts.length === 0 && pageNum === 1)
      return { parts: [], noMatch: false };
    if (pageParts.length === 0) break;
    addPicked(pageParts);
    if (!(await hasNextPartsTablePage(page))) break;
    pageNum++;
    status(`Moving to page ${pageNum}...`);
    const nextOk = await goToNextPartsTablePage(page);
    if (!nextOk) break;
    await filterInput.fill(effectiveFilter);
    await sleep(400);
  }

  await enrichPartsFigureImages(page, collectedParts);

  return { parts: collectedParts, noMatch: false };
}

export type SelectedPartForDetailList = {
  partNumber: string;
  description: string;
  servicePartNumber?: string;
};

export type DetailListPreferredCategory = {
  parentName: string;
  subcategoryName?: string;
};

function getDetailListFilterValue(
  selectedPart: SelectedPartForDetailList,
): string {
  return (
    (selectedPart.partNumber && selectedPart.partNumber.trim()) ||
    (selectedPart.description && selectedPart.description.trim()) ||
    ""
  );
}

export async function findPartInDetailListByDescription(
  page: Page,
  selectedPart: SelectedPartForDetailList,
  onStatus?: (message: string) => void,
  excludedParentNames: string[] = [],
  preferred?: DetailListPreferredCategory,
  abortSignal?: AbortSignal,
): Promise<{ section: string; subcategory: string } | null> {
  const status = (msg: string) => {
    console.log("[part-search]", msg);
    onStatus?.(msg);
  };
  const config = loadConfig();
  if (!preferred?.parentName && !config.openaiApiKey) return null;
  const referenceText = getReferenceTextForPromptAsync();
  const partContext = `${selectedPart.description || ""} (Part #${selectedPart.partNumber})`;
  const filterValue = getDetailListFilterValue(selectedPart);
  let triedParents = new Set(excludedParentNames.map((n) => normalize(n)));

  for (;;) {
    if (abortSignal?.aborted) throw new ScraperCancelledError();
    let infos: NodeInfo[] = [];
    for (let r = 0; r < DETAIL_LIST_MAX_TREE_RETRIES; r++) {
      infos = await getTreeNodes(page, DETAIL_LIST_TREE_WAIT_MS).catch(
        () => [],
      );
      const rootCategories = getRootCategories(infos);
      if (infos.length > 0 && rootCategories.length > 0) break;
      if (r < DETAIL_LIST_MAX_TREE_RETRIES - 1) {
        status("Waiting for catalog tree...");
        await sleep(DETAIL_LIST_RETRY_SLEEP_MS);
      }
    }
    if (infos.length === 0) return null;
    const rootCategories = getRootCategories(infos);
    if (rootCategories.length === 0) return null;
    const rootNames = rootCategories.map((r) => r.text).filter(Boolean);
    let categoryName: string;
    let categoryNode: NodeInfo | null;

    if (preferred?.parentName) {
      categoryNode =
        rootCategories.find((r) =>
          nodeTextMatches(r.text, preferred!.parentName),
        ) ?? null;
      if (!categoryNode) {
        status(
          `Preferred category "${preferred.parentName}" not found in tree.`,
        );
        return null;
      }
      categoryName = categoryNode.text;
      status(
        `Looking in category: ${categoryName}${preferred.subcategoryName ? ` > ${preferred.subcategoryName}` : ""}`,
      );
      triedParents.add(normalize(categoryName));
    } else {
      const availableNames = rootNames.filter(
        (n) => !triedParents.has(normalize(n)),
      );
      if (availableNames.length === 0) return null;
      if (triedParents.size >= DETAIL_LIST_MAX_AI_PARENTS) {
        status(
          `Part not found in any of ${DETAIL_LIST_MAX_AI_PARENTS} AI-suggested parent categories. Stopping.`,
        );
        return null;
      }
      const parentAttempt = triedParents.size + 1;
      status(
        `AI flow: checking parent category ${parentAttempt} of ${DETAIL_LIST_MAX_AI_PARENTS}...`,
      );
      status("Asking AI which category contains this part...");
      let aiCategoryName = await pickCategory(
        config.openaiApiKey,
        partContext,
        availableNames,
        referenceText,
      );
      if (!aiCategoryName) aiCategoryName = availableNames[0] ?? null;
      if (!aiCategoryName) return null;
      const nameToMatch: string = aiCategoryName;
      categoryNode =
        rootCategories.find((r) => nodeTextMatches(r.text, nameToMatch)) ??
        rootCategories.find((r) => availableNames.includes(r.text)) ??
        rootCategories[0] ??
        null;
      if (!categoryNode) return null;
      categoryName = categoryNode.text;
      status(`AI suggested category: "${categoryName}"`);
    }

    const matchIndex = categoryNode.index;
    const matchIndent = categoryNode.indentCount;
    const match = infos[matchIndex]!;
    if (match.hasExpandPlus) {
      const parentLi = page.locator(oc.treeNode).nth(matchIndex);
      await parentLi.locator(oc.treeExpandIcon).first().click();
      await sleep(300);
    }
    for (let i = matchIndex - 1; i >= 0; i--) {
      const prev = infos[i]!;
      if (prev.indentCount < matchIndent && prev.hasExpandPlus) {
        const parentLi = page.locator(oc.treeNode).nth(i);
        await parentLi.locator(oc.treeExpandIcon).first().click();
        await sleep(250);
        break;
      }
    }
    await sleep(300);
    let freshInfos = await getTreeNodes(page, DETAIL_LIST_TREE_WAIT_MS).catch(
      () => infos,
    );
    if (freshInfos.length === 0) freshInfos = infos;
    const children = getDirectChildren(freshInfos, matchIndex, matchIndent);
    if (children.length === 0) {
      const loc = page.locator(oc.treeNode).nth(matchIndex);
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(200);
      await loc.click({ force: true });
      status("Waiting for table...");
      let tableReady = false;
      for (
        let tr = 0;
        tr < DETAIL_LIST_MAX_TABLE_RETRIES && !tableReady;
        tr++
      ) {
        try {
          await waitForDetailListTableAndFilter(page);
          tableReady = true;
        } catch {
          if (tr < DETAIL_LIST_MAX_TABLE_RETRIES - 1)
            await sleep(DETAIL_LIST_RETRY_SLEEP_MS);
        }
      }
      if (!tableReady) {
        if (!preferred?.parentName) triedParents.add(normalize(categoryName));
        continue;
      }
      const filterInput = page.locator("#partsTable_filter input").first();
      status("Filling filter with part number...");
      await filterInput.scrollIntoViewIfNeeded().catch(() => {});
      await filterInput.click();
      await filterInput.fill(filterValue);
      await sleep(500);
      const emptyCell = page
        .locator(oc.partsTable)
        .locator("td.dataTables_empty")
        .first();
      const emptyVisible = await emptyCell.isVisible().catch(() => false);
      if (emptyVisible) {
        const emptyText = await emptyCell.textContent().catch(() => "");
        if (/no matching records found/i.test(emptyText ?? "")) {
          if (preferred?.parentName) return null;
          continue;
        }
      }
      const { parts: tableParts } = await scrapeAllTableRows(page);
      const row = tableParts.find(
        (p) =>
          (p.partNumber &&
            normalize(p.partNumber) === normalize(selectedPart.partNumber)) ||
          (selectedPart.servicePartNumber &&
            p.servicePartNumber &&
            normalize(p.servicePartNumber) ===
              normalize(selectedPart.servicePartNumber)),
      );
      if (row) return { section: categoryName, subcategory: categoryName };
      if (preferred?.parentName) return null;
      triedParents.add(normalize(categoryName));
      continue;
    }

    const childNames = children.map((c) => c.text).filter(Boolean);
    const triedSubcats = new Set<string>();

    if (
      preferred?.parentName &&
      (preferred.subcategoryName || childNames.length > 0)
    ) {
      const toTryFirst = preferred.subcategoryName
        ? [preferred.subcategoryName]
        : [];
      const orderToTry = [
        ...new Set([
          ...toTryFirst,
          ...childNames.filter((n) => !toTryFirst.includes(n)),
        ]),
      ];
      for (const nextSubcatName of orderToTry) {
        if (triedSubcats.has(normalize(nextSubcatName))) continue;
        const childNode = children.find((c) =>
          nodeTextMatches(c.text, nextSubcatName),
        );
        if (!childNode) {
          triedSubcats.add(normalize(nextSubcatName));
          continue;
        }
        const loc = page.locator(oc.treeNode).nth(childNode.index);
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        await sleep(200);
        await loc.click({ force: true });
        status("Waiting for table...");
        let tableReady = false;
        for (
          let tr = 0;
          tr < DETAIL_LIST_MAX_TABLE_RETRIES && !tableReady;
          tr++
        ) {
          try {
            await waitForDetailListTableAndFilter(page);
            tableReady = true;
          } catch {
            if (tr < DETAIL_LIST_MAX_TABLE_RETRIES - 1)
              await sleep(DETAIL_LIST_RETRY_SLEEP_MS);
          }
        }
        if (!tableReady) {
          triedSubcats.add(normalize(nextSubcatName));
          continue;
        }
        const filterInput = page.locator("#partsTable_filter input").first();
        status("Filling filter with part number...");
        await filterInput.scrollIntoViewIfNeeded().catch(() => {});
        await filterInput.click();
        await filterInput.fill(filterValue);
        await sleep(500);
        const emptyCell = page
          .locator(oc.partsTable)
          .locator("td.dataTables_empty")
          .first();
        const emptyVisible = await emptyCell.isVisible().catch(() => false);
        if (emptyVisible) {
          const emptyText = await emptyCell.textContent().catch(() => "");
          if (/no matching records found/i.test(emptyText ?? "")) {
            triedSubcats.add(normalize(nextSubcatName));
            continue;
          }
        }
        const { parts: tableParts } = await scrapeAllTableRows(page);
        const row = tableParts.find(
          (p) =>
            (p.partNumber &&
              normalize(p.partNumber) === normalize(selectedPart.partNumber)) ||
            (selectedPart.servicePartNumber &&
              p.servicePartNumber &&
              normalize(p.servicePartNumber) ===
                normalize(selectedPart.servicePartNumber)),
        );
        if (row) return { section: categoryName, subcategory: nextSubcatName };
        triedSubcats.add(normalize(nextSubcatName));
      }
      if (preferred?.parentName) return null;
      triedParents.add(normalize(categoryName));
      continue;
    }

    for (;;) {
      if (abortSignal?.aborted) throw new ScraperCancelledError();
      const remaining = childNames.filter(
        (n) => !triedSubcats.has(normalize(n)),
      );
      if (remaining.length === 0) {
        triedParents.add(normalize(categoryName));
        break;
      }
      if (triedSubcats.size > 0) {
        status(
          "Not found in this subcategory. Asking AI for next subcategory...",
        );
      } else {
        status("Asking AI which subcategory to open...");
      }
      const excludedList = Array.from(triedSubcats);
      const nextSubcatName = await pickNextSubcategory(
        config.openaiApiKey,
        partContext,
        childNames,
        excludedList,
        referenceText,
      );
      if (!nextSubcatName || triedSubcats.has(normalize(nextSubcatName))) {
        triedParents.add(normalize(categoryName));
        break;
      }
      const childNode = children.find((c) =>
        nodeTextMatches(c.text, nextSubcatName),
      );
      if (!childNode) {
        triedSubcats.add(normalize(nextSubcatName));
        continue;
      }
      const loc = page.locator(oc.treeNode).nth(childNode.index);
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(200);
      await loc.click({ force: true });
      status("Waiting for table...");
      let tableReady = false;
      for (
        let tr = 0;
        tr < DETAIL_LIST_MAX_TABLE_RETRIES && !tableReady;
        tr++
      ) {
        try {
          await waitForDetailListTableAndFilter(page);
          tableReady = true;
        } catch {
          if (tr < DETAIL_LIST_MAX_TABLE_RETRIES - 1)
            await sleep(DETAIL_LIST_RETRY_SLEEP_MS);
        }
      }
      if (!tableReady) {
        triedSubcats.add(normalize(nextSubcatName));
        continue;
      }
      const filterInput = page.locator("#partsTable_filter input").first();
      status("Filling filter with part number...");
      await filterInput.scrollIntoViewIfNeeded().catch(() => {});
      await filterInput.click();
      await filterInput.fill(filterValue);
      await sleep(500);
      const emptyCell = page
        .locator(oc.partsTable)
        .locator("td.dataTables_empty")
        .first();
      const emptyVisible = await emptyCell.isVisible().catch(() => false);
      if (emptyVisible) {
        const emptyText = await emptyCell.textContent().catch(() => "");
        if (/no matching records found/i.test(emptyText ?? "")) {
          triedSubcats.add(normalize(nextSubcatName));
          continue;
        }
      }
      const { parts: tableParts } = await scrapeAllTableRows(page);
      const row = tableParts.find(
        (p) =>
          (p.partNumber &&
            normalize(p.partNumber) === normalize(selectedPart.partNumber)) ||
          (selectedPart.servicePartNumber &&
            p.servicePartNumber &&
            normalize(p.servicePartNumber) ===
              normalize(selectedPart.servicePartNumber)),
      );
      if (row) return { section: categoryName, subcategory: nextSubcatName };
      triedSubcats.add(normalize(nextSubcatName));
    }
  }
}

async function scrapeModalRelatedParts(page: Page): Promise<PartRow[]> {
  const modalTable = page.locator(oc.partOptionsTable);
  const visible = await modalTable.isVisible().catch(() => false);
  if (!visible) return [];
  const rows = await page.locator(oc.partOptionsTableRows).all();
  const out: PartRow[] = [];
  for (const row of rows) {
    const tds = await row.locator("td").allTextContents();
    if (tds.length < 3) continue;
    const partNumber = tds[1]?.trim() ?? "";
    const description = tds[2]?.trim() ?? "";
    if (partNumber || description) {
      out.push({ partNumber, description });
    }
  }
  return out;
}

async function hasNextPartsTablePage(page: Page): Promise<boolean> {
  const nextBtn = page.locator(oc.partsTablePaginateNext).first();
  const visible = await nextBtn.isVisible().catch(() => false);
  if (!visible) return false;
  const disabled = await nextBtn
    .getAttribute("class")
    .then((c) => (c || "").includes("disabled"))
    .catch(() => true);
  return !disabled;
}

async function goToNextPartsTablePage(page: Page): Promise<boolean> {
  if (!(await hasNextPartsTablePage(page))) return false;
  const nextBtn = page.locator(oc.partsTablePaginateNext).first();
  await nextBtn.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(150);
  await nextBtn.click({ force: true });
  await waitForPartsTableReady(page);
  return true;
}

async function getCurrentPartsTablePageNumber(page: Page): Promise<number> {
  const currentBtn = page.locator(oc.partsTablePaginateCurrent).first();
  const text = await currentBtn.textContent().catch(() => "1");
  const n = parseInt((text ?? "1").trim(), 10);
  return Number.isFinite(n) ? n : 1;
}

async function findPartInTreeAndScrapeTableForSegment(
  page: Page,
  segmentQuery: string,
  onStatus?: (message: string) => void,
): Promise<{ parts: PartRow[]; category?: string; subcategories?: string[] }> {
  const empty = {
    parts: [] as PartRow[],
    category: undefined as string | undefined,
    subcategories: undefined as string[] | undefined,
  };
  const query = segmentQuery.trim();
  if (!query) return empty;

  const status = (msg: string) => {
    console.log("[part-search]", msg);
    onStatus?.(msg);
  };

  const config = loadConfig();
  if (!config.openaiApiKey) {
    status("OpenAI API key not set; cannot run AI-only part search.");
    return empty;
  }

  const referenceText = getReferenceTextForPromptAsync();

  status(`Searching for part "${query}"...`);
  const infos = await getTreeNodes(page);
  if (infos.length === 0) return empty;

  const rootCategories = getRootCategories(infos);
  if (rootCategories.length === 0) return empty;

  const rootNames = rootCategories.map((r) => r.text).filter(Boolean);
  status("Asking AI which category contains this part...");
  const categoryName = await pickCategory(
    config.openaiApiKey,
    query,
    rootNames,
    referenceText,
  );
  if (!categoryName) return empty;

  status(`AI suggested category: "${categoryName}"`);
  const categoryNode = rootCategories.find((r) =>
    nodeTextMatches(r.text, categoryName),
  );
  if (!categoryNode) return empty;

  const matchIndex = categoryNode.index;
  const matchIndent = categoryNode.indentCount;
  const match = infos[matchIndex]!;

  if (match.hasExpandPlus) {
    const parentLi = page.locator(oc.treeNode).nth(matchIndex);
    await parentLi.locator(oc.treeExpandIcon).first().click();
    await sleep(300);
  }

  for (let i = matchIndex - 1; i >= 0; i--) {
    const prev = infos[i]!;
    if (prev.indentCount < matchIndent && prev.hasExpandPlus) {
      const parentLi = page.locator(oc.treeNode).nth(i);
      await parentLi.locator(oc.treeExpandIcon).first().click();
      await sleep(250);
      break;
    }
  }

  await sleep(300);

  const freshInfos = await getTreeNodes(page);
  const children = getDirectChildren(freshInfos, matchIndex, matchIndent);

  const parts: PartRow[] = [];
  const seenKeys = new Set<string>();

  function addPart(p: PartRow): void {
    const key = `${p.partNumber}|${p.description ?? ""}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      parts.push(p);
    }
  }

  async function scrapeTableForCurrentNode(): Promise<void> {
    await waitForPartsTableReady(page);
    await page
      .locator(oc.partsTable)
      .waitFor({ state: "visible", timeout: TABLE_WAIT_MS })
      .catch(() => {});

    let currentPage = await getCurrentPartsTablePageNumber(page);

    while (true) {
      const { parts: tableParts, relatedLinkRowIndices } =
        await scrapeAllTableRows(page);

      if (tableParts.length === 0) {
        if (await hasNextPartsTablePage(page)) {
          const nextPage = currentPage + 1;
          status(
            `Moving to page ${nextPage} — no matching entry on page ${currentPage}.`,
          );
          await goToNextPartsTablePage(page);
          currentPage = nextPage;
          continue;
        }
        break;
      }

      status(
        currentPage === 1
          ? "Asking AI which row in the table best matches this part..."
          : `Asking AI which row on page ${currentPage} best matches this part...`,
      );
      const tableOptions: TableRowOption[] = tableParts.map((p) => ({
        partNumber: p.partNumber,
        description: p.description,
        item: p.item,
      }));
      const pickedPartNumber = await pickTableRow(
        config.openaiApiKey,
        query,
        tableOptions,
        referenceText,
      );

      if (pickedPartNumber) {
        const row = tableParts.find(
          (p) =>
            p.partNumber === pickedPartNumber ||
            p.partNumber.includes(pickedPartNumber) ||
            pickedPartNumber.includes(p.partNumber),
        );
        if (row) {
          addPart(row);
          if (currentPage > 1) {
            status(
              `AI suggested this row from the table (page ${currentPage}): Part #${row.partNumber} — ${row.description || "(no description)"}`,
            );
          } else {
            status(
              `AI suggested this row from the table: Part #${row.partNumber} — ${row.description || "(no description)"}`,
            );
          }
          const pickedRowIndex = row.rowIndex;
          if (
            pickedRowIndex !== undefined &&
            relatedLinkRowIndices.includes(pickedRowIndex)
          ) {
            const rowLocator = page
              .locator(oc.partsTable)
              .locator("tbody tr")
              .nth(pickedRowIndex);
            const relatedLink = rowLocator
              .locator(`td:nth-child(${OPTIONS_COL}) img.relatedURL`)
              .first();
            if (await relatedLink.isVisible().catch(() => false)) {
              await relatedLink.scrollIntoViewIfNeeded().catch(() => {});
              await sleep(100);
              await relatedLink.click({ force: true });
              await page
                .waitForSelector(oc.partOptionsTable, {
                  state: "visible",
                  timeout: MODAL_WAIT_MS,
                })
                .catch(() => null);
              await sleep(200);
              const modalParts = await scrapeModalRelatedParts(page);
              modalParts.forEach(addPart);
              const closeBtn = page.locator(oc.partOptionsModalClose).first();
              if (await closeBtn.isVisible().catch(() => false))
                await closeBtn.click().catch(() => {});
              else await page.keyboard.press("Escape");
              await sleep(250);
            }
          }
          return;
        }
      }

      if (await hasNextPartsTablePage(page)) {
        const nextPage = currentPage + 1;
        status(
          `Moving to page ${nextPage} — no matching entry on page ${currentPage}.`,
        );
        await goToNextPartsTablePage(page);
        currentPage = nextPage;
      } else {
        break;
      }
    }
  }

  if (children.length === 0) {
    const loc = page.locator(oc.treeNode).nth(matchIndex);
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(200);
    await loc.click({ force: true });
    await scrapeTableForCurrentNode();
    return { parts, category: categoryName, subcategories: undefined };
  }

  status("Asking AI which subcategory(ies) to open...");
  const childNames = children.map((c) => c.text).filter(Boolean);
  const subcatNames = await pickSubcategories(
    config.openaiApiKey,
    query,
    childNames,
    referenceText,
  );
  if (subcatNames.length === 0)
    return { parts, category: categoryName, subcategories: [] };

  status(
    `AI suggested subcategory(ies): ${subcatNames.map((s) => `"${s}"`).join(", ")}`,
  );
  for (const subcatName of subcatNames) {
    const childNode = children.find((c) => nodeTextMatches(c.text, subcatName));
    if (!childNode) continue;

    const loc = page.locator(oc.treeNode).nth(childNode.index);
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(200);
    await loc.click({ force: true });
    await scrapeTableForCurrentNode();
  }

  return { parts, category: categoryName, subcategories: subcatNames };
}

export async function findPartInTreeAndScrapeTable(
  page: Page,
  skuQuery: string,
  onStatus?: (message: string) => void,
  userRole?: "admin" | "internal" | "customer",
): Promise<PartRow[]> {
  const raw = skuQuery.trim();
  if (!raw) return [];

  const status = (msg: string) => {
    console.log("[part-search]", msg);
    onStatus?.(msg);
  };

  const config = loadConfig();
  const hasMultipleParts = /\s+and\s+/i.test(raw) || raw.includes(",");
  let queries: string[];

  if (hasMultipleParts && config.openaiApiKey) {
    const referenceText = getReferenceTextForPromptAsync();
    const terms = await extractPartTermsFromQuery(
      config.openaiApiKey,
      raw,
      referenceText,
    );
    queries = terms.length > 0 ? terms : [raw];
    if (queries.length > 1) {
      const msg = `OpenAI extracted part terms: ${queries.map((q) => `"${q}"`).join(", ")}`;
      status(msg);
    }
  } else {
    queries = [raw];
  }

  const allParts: PartRow[] = [];
  const seenKeys = new Set<string>();

  for (const q of queries) {
    const segmentResult = await findPartInTreeAndScrapeTableForSegment(
      page,
      q,
      onStatus,
    );
    const segmentParts = segmentResult.parts;
    for (const p of segmentParts) {
      const key = `${p.partNumber}|${p.description ?? ""}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        allParts.push(p);
      }
    }
    if (segmentParts.length > 0) {
      const segmentAnswer = segmentParts.map((p) => p.partNumber).join(" and ");
      appendLearnedExample(q, segmentAnswer, {
        category: segmentResult.category,
        subcategories: segmentResult.subcategories,
      }, userRole);
    }
  }

  if (allParts.length > 0) {
    const answer = allParts.map((p) => p.partNumber).join(" and ");
    appendLearnedExample(raw, answer, undefined, userRole);
  }

  status("Part search complete.");
  return allParts;
}
