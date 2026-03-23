import fs from "node:fs";
import { login } from "./steps/login.js";
import { loadConfig } from "./config.js";
import { needsLogin } from "./session.js";
import { chromium, type Page } from "playwright";
import { submitVinSearch } from "./steps/vin-form.js";
import { goToPartSearch } from "./steps/navigation.js";
import { openDetailList } from "./steps/detail-list.js";
import { resolvePartTerm } from "./data/part-terminology.js";
import { logScraperError } from "./services/error-handler.js";
import { resolveDetailListParent } from "./services/chassis-type-api.js";
import { getReferenceTextForPromptAsync, refreshDbExamples } from "./data/query-examples.js";
import { extractBuildSheet, type ExtractedData } from "./steps/extract.js";
import {
  closePostLoginModal,
  closeOnCommandMessageModal,
} from "./steps/modal.js";
import {
  ScraperCancelledError,
  ScraperTimeoutError,
} from "./scraper-cancelled-error.js";
import {
  findPartInDetailListByDescription,
  findPartViaSearchTab,
  searchAgainOnSamePage,
} from "./steps/part-search.js";
import {
  pickSuggestedPartFromSearchResults,
  extractPartNameForSearch,
  extractPartTermsFromQuery,
  suggestSearchTermForPart,
} from "./services/ai-fallback.js";

function stripQuantityForSearch(term: string): string {
  const t = term.trim();
  const out = t
    .replace(/^\s*\d+\s*(x\s*\d*)?\s*/i, "")
    .replace(/^\s*x\s*\d*\s*/i, "")
    .trim();
  return out || t;
}

export type SelectionOutcome =
  | { selectedPart: VinLookupResult["parts"][0]; partIndex?: number }
  | {
      selections: Array<{
        termIndex: number;
        selectedPart: VinLookupResult["parts"][0];
      }>;
    }
  | { stop: true };

export interface RunVinLookupOptions {
  vin: string;
  cartName: string;
  skuQuery?: string;
  userRole?: "admin" | "internal" | "customer";
  onStatus?: (message: string) => void;
  jobId?: string;
  abortSignal?: AbortSignal;
  scraperTimeoutMs?: number;
  onAwaitingSelection?: (payload: {
    parts?: VinLookupResult["parts"];
    suggestedPart?: { sku: string };
    partsPerTerm?: Array<{
      term: string;
      parts: VinLookupResult["parts"];
      suggestedPart?: { sku: string };
    }>;
  }) => void;
  waitForSelection?: () => Promise<SelectionOutcome>;
}

function throwIfAborted(
  abortSignal?: AbortSignal,
  workTimeoutAborted?: boolean,
): void {
  if (workTimeoutAborted) throw new ScraperTimeoutError();
  if (abortSignal?.aborted) throw new ScraperCancelledError();
}

export interface VinLookupResult {
  vin: string;
  found: boolean;
  parts: Array<{
    sku?: string;
    description?: string;
    section?: string;
    compatibility?: string;
    figureImageUrl?: string;
  }>;
  buildSheet?: ExtractedData["buildSheet"];
  model?: string;
  engine?: string;
  responseTimeMs: number;
  cached: boolean;
  scrapedAt?: string;
  noMatch?: boolean;
  cancelled?: boolean;
}

export async function runVinLookup(
  options: RunVinLookupOptions,
): Promise<VinLookupResult> {
  const start = Date.now();
  // Pre-load DB examples from internal/admin user lookups for AI prompts
  await refreshDbExamples().catch(() => {});
  const config = loadConfig();
  const result: VinLookupResult = {
    vin: options.vin,
    found: false,
    parts: [],
    responseTimeMs: 0,
    cached: false,
  };

  const status = (message: string) => {
    console.log("[vin-lookup]", message);
    options.onStatus?.(message);
  };

  const hasStoredState = fs.existsSync(config.sessionStatePath);

  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  options.abortSignal?.addEventListener(
    "abort",
    () => {
      browser.close().catch(() => {});
    },
    { once: true },
  );

  const context = await browser.newContext({
    ...(hasStoredState ? { storageState: config.sessionStatePath } : {}),
  });

  const page = await context.newPage();
  let currentPage: Page = page;
  let lastStep = "init";

  let workTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let workTimeoutController: AbortController | null = null;
  function disarmWorkTimeout(): void {
    if (workTimeoutId) clearTimeout(workTimeoutId);
    workTimeoutId = null;
    workTimeoutController = null;
  }
  function armWorkTimeout(): void {
    disarmWorkTimeout();
    if (!options.scraperTimeoutMs) return;
    workTimeoutController = new AbortController();
    workTimeoutId = setTimeout(
      () => workTimeoutController!.abort(),
      options.scraperTimeoutMs,
    );
  }

  try {
    armWorkTimeout();
    lastStep = "navigation";
    status("Navigating to portal...");
    const initialUrl = hasStoredState ? config.dashboardUrl : config.loginUrl;
    await page.goto(initialUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.navigationTimeout,
    });

    if (await needsLogin(page)) {
      lastStep = "login";
      status("Logging in...");
      await login(page, config);
      await context.storageState({ path: config.sessionStatePath });
    }

    lastStep = "modal";
    status("Closing modal...");
    await closePostLoginModal(page);
    await context.storageState({ path: config.sessionStatePath });

    let targetPage: Page = page;

    let searchParts: Array<{
      sku?: string;
      description?: string;
      section?: string;
      compatibility?: string;
    }> | null = null;
    let searchNoMatch = false;

    if (options.skuQuery?.trim()) {
      lastStep = "findPartViaSearchTab";
      const userQuery = options.skuQuery.trim();
      let terms: string[] = config.openaiApiKey
        ? await extractPartTermsFromQuery(
            config.openaiApiKey,
            userQuery,
            getReferenceTextForPromptAsync(),
          ).catch(() => [userQuery])
        : [userQuery];
      if (terms.length === 0) terms = [userQuery];
      terms = terms.map(stripQuantityForSearch).filter(Boolean);
      if (terms.length === 0) terms = [userQuery];

      let searchTerms: string[];
      if (config.openaiApiKey) {
        searchTerms = [];
        const refText = getReferenceTextForPromptAsync();
        for (let i = 0; i < terms.length; i++) {
          const term = terms[i]!;
          status(`Checking if "${term}" is an actual part name or slang...`);
          const suggested = await suggestSearchTermForPart(
            config.openaiApiKey,
            term,
            refText,
          ).catch(() => null);
          searchTerms.push(
            suggested && suggested.trim()
              ? suggested.trim()
              : resolvePartTerm(term),
          );
        }
      } else {
        searchTerms = terms.map((t) => resolvePartTerm(t));
      }

      if (terms.length > 1) {
        status("Opening part search...");
        await goToPartSearch(page);
        status("Submitting VIN and opening catalog...");
        targetPage = await submitVinSearch(page, {
          cartName: options.cartName,
          vin: options.vin,
        });
        currentPage = targetPage;
        await closeOnCommandMessageModal(targetPage);

        status(`Searching for: "${searchTerms[0]}"`);
        const r0 = await findPartViaSearchTab(
          targetPage,
          searchTerms[0]!,
          options.onStatus,
        );
        const results: Array<{ parts: typeof r0.parts; noMatch: boolean }> = [
          r0,
        ];
        for (let i = 1; i < terms.length; i++) {
          status(`Searching for: "${searchTerms[i]}"`);
          const r = await searchAgainOnSamePage(
            targetPage,
            searchTerms[i]!,
            options.onStatus,
          );
          results.push(r);
        }

        const refText = getReferenceTextForPromptAsync();
        const partsPerTerm: Array<{
          term: string;
          parts: VinLookupResult["parts"];
          suggestedPart?: { sku: string };
        }> = [];
        for (let i = 0; i < terms.length; i++) {
          const r = results[i]!;
          const parts = r.parts.map((p) => ({
            sku: p.partNumber,
            description: p.description,
            section: p.item,
            compatibility: p.servicePartNumber,
            figureImageUrl: p.figureImageUrl,
          }));
          let suggestedPart: { sku: string } | undefined;
          if (config.openaiApiKey && parts.length > 0) {
            const sku = await pickSuggestedPartFromSearchResults(
              config.openaiApiKey,
              terms[i]!,
              r.parts.map((p) => ({
                partNumber: p.partNumber,
                description: p.description,
                item: p.item,
              })),
              refText,
            ).catch(() => null);
            if (sku) suggestedPart = { sku };
          }
          partsPerTerm.push({ term: terms[i]!, parts, suggestedPart });
        }

        if (options.waitForSelection) {
          options.onAwaitingSelection?.({ partsPerTerm });
          disarmWorkTimeout();
          const selection = await options.waitForSelection();
          armWorkTimeout();
          if ("stop" in selection && selection.stop) {
            result.cancelled = true;
            result.responseTimeMs = Date.now() - start;
            return result;
          }

          if (
            "selections" in selection &&
            Array.isArray(selection.selections) &&
            selection.selections.length > 0
          ) {
            lastStep = "openDetailList";
            status("Opening detail list...");
            throwIfAborted(
              options.abortSignal,
              workTimeoutController?.signal.aborted,
            );
            await openDetailList(targetPage);
            lastStep = "extractBuildSheet";
            status("Extracting build sheet...");
            const extracted = await extractBuildSheet(targetPage);
            result.vin = extracted.vin || options.vin;
            result.buildSheet = extracted.buildSheet;
            result.model = extracted.model;
            result.engine = extracted.engine;
            result.scrapedAt = extracted.scrapedAt;
            const vinForResolve = extracted.vin || options.vin;

            const resultParts: VinLookupResult["parts"] = [];
            for (let i = 0; i < selection.selections.length; i++) {
              const { selectedPart } = selection.selections[i]!;
              const preferred = await resolveDetailListParent(
                vinForResolve,
                {
                  partNumber: selectedPart.sku ?? "",
                  description: selectedPart.description ?? "",
                },
                { fetchLike: (url) => targetPage.request.get(url) },
              ).catch(() => null);
              if (preferred) {
                status(
                  `Looking in category: ${preferred.parentName}${preferred.subcategoryName ? ` > ${preferred.subcategoryName}` : ""}`,
                );
              } else {
                status(
                  "Could not resolve category from catalog API; using AI to pick category.",
                );
              }
              status(`Searching for selected part ${i + 1} in detail list...`);
              throwIfAborted(
                options.abortSignal,
                workTimeoutController?.signal.aborted,
              );
              const match = await findPartInDetailListByDescription(
                targetPage,
                {
                  partNumber: selectedPart.sku ?? "",
                  description: selectedPart.description ?? "",
                  servicePartNumber: selectedPart.compatibility,
                },
                options.onStatus,
                [],
                preferred ?? undefined,
                options.abortSignal,
              );
              if (match) {
                resultParts.push({ ...selectedPart, section: match.section });
              } else {
                resultParts.push(selectedPart);
              }
            }
            result.parts = resultParts;
            result.found = resultParts.length > 0;
            result.responseTimeMs = Date.now() - start;
            return result;
          }

          const partIndex = selection.partIndex ?? 0;
          const selectedPart = selection.selectedPart;
          lastStep = "openDetailList";
          status("Opening detail list...");
          throwIfAborted(
            options.abortSignal,
            workTimeoutController?.signal.aborted,
          );
          await openDetailList(targetPage);
          lastStep = "extractBuildSheet";
          status("Extracting build sheet...");
          const extracted = await extractBuildSheet(targetPage);
          result.vin = extracted.vin || options.vin;
          result.buildSheet = extracted.buildSheet;
          result.model = extracted.model;
          result.engine = extracted.engine;
          result.scrapedAt = extracted.scrapedAt;
          const vinForResolve = extracted.vin || options.vin;
          const preferred = await resolveDetailListParent(
            vinForResolve,
            {
              partNumber: selectedPart.sku ?? "",
              description: selectedPart.description ?? "",
            },
            { fetchLike: (url) => targetPage.request.get(url) },
          ).catch(() => null);
          if (preferred) {
            status(
              `Looking in category: ${preferred.parentName}${preferred.subcategoryName ? ` > ${preferred.subcategoryName}` : ""}`,
            );
          } else {
            status(
              "Could not resolve category from catalog API; using AI to pick category.",
            );
          }
          status("Searching for selected part in detail list...");
          throwIfAborted(
            options.abortSignal,
            workTimeoutController?.signal.aborted,
          );
          const match = await findPartInDetailListByDescription(
            targetPage,
            {
              partNumber: selectedPart.sku ?? "",
              description: selectedPart.description ?? "",
              servicePartNumber: selectedPart.compatibility,
            },
            options.onStatus,
            [],
            preferred ?? undefined,
            options.abortSignal,
          );
          if (match) {
            result.parts = [{ ...selectedPart, section: match.section }];
            result.found = true;
          } else {
            result.parts = [selectedPart];
            result.found = false;
          }
          result.responseTimeMs = Date.now() - start;
          return result;
        }

        searchNoMatch = results.every((r) => r.noMatch);
        searchParts = partsPerTerm.flatMap((x) => x.parts);
      } else {
        lastStep = "goToPartSearch";
        status("Opening part search...");
        await goToPartSearch(page);
        lastStep = "submitVinSearch";
        status("Submitting VIN and opening catalog...");
        targetPage = await submitVinSearch(page, {
          cartName: options.cartName,
          vin: options.vin,
        });
        currentPage = targetPage;
        lastStep = "closeOnCommandMessageModal";
        await closeOnCommandMessageModal(targetPage);
        let searchTerm = terms[0] ?? userQuery;
        if (config.openaiApiKey) {
          const extracted = await extractPartNameForSearch(
            config.openaiApiKey,
            userQuery,
            getReferenceTextForPromptAsync(),
          ).catch(() => null);
          if (extracted) searchTerm = extracted;
          status("Checking if this is an actual part name or slang...");
          const suggested = await suggestSearchTermForPart(
            config.openaiApiKey,
            searchTerm,
            getReferenceTextForPromptAsync(),
          ).catch(() => null);
          if (suggested && suggested.trim()) searchTerm = suggested.trim();
          else searchTerm = resolvePartTerm(searchTerm);
        } else {
          searchTerm = resolvePartTerm(searchTerm);
        }
        status(`Searching parts for: "${searchTerm}"`);
        const searchResult = await findPartViaSearchTab(
          targetPage,
          searchTerm,
          options.onStatus,
        );
        searchNoMatch = searchResult.noMatch;
        searchParts = searchResult.parts.map((p) => ({
          sku: p.partNumber,
          description: p.description,
          section: p.item,
          compatibility: p.servicePartNumber,
          figureImageUrl: p.figureImageUrl,
        }));
      }
    } else {
      lastStep = "goToPartSearch";
      status("Opening part search...");
      await goToPartSearch(page);
      lastStep = "submitVinSearch";
      status("Submitting VIN and opening catalog...");
      targetPage = await submitVinSearch(page, {
        cartName: options.cartName,
        vin: options.vin,
      });
      currentPage = targetPage;
      lastStep = "closeOnCommandMessageModal";
      await closeOnCommandMessageModal(targetPage);
    }

    if (searchParts && searchParts.length > 0 && options.waitForSelection) {
      let suggestedPart: { sku: string } | undefined;
      if (config.openaiApiKey) {
        status("Asking AI which part is most likely correct...");
        const suggestedSku = await pickSuggestedPartFromSearchResults(
          config.openaiApiKey,
          options.skuQuery!.trim(),
          searchParts.map((p) => ({
            partNumber: p.sku ?? "",
            description: p.description ?? "",
            item: p.section,
          })),
          getReferenceTextForPromptAsync(),
        ).catch(() => null);
        if (suggestedSku) suggestedPart = { sku: suggestedSku };
      }
      options.onAwaitingSelection?.({ parts: searchParts, suggestedPart });
      disarmWorkTimeout();
      const selection = await options.waitForSelection();
      armWorkTimeout();
      if ("stop" in selection && selection.stop) {
        result.cancelled = true;
        result.responseTimeMs = Date.now() - start;
        if (targetPage !== page) {
          await targetPage.close().catch(() => {});
        }
        return result;
      }
      const selectedPart = selection.selectedPart;
      lastStep = "openDetailList";
      status("Opening detail list...");
      throwIfAborted(
        options.abortSignal,
        workTimeoutController?.signal.aborted,
      );
      await openDetailList(targetPage);
      lastStep = "extractBuildSheet";
      status("Extracting build sheet...");
      const extracted = await extractBuildSheet(targetPage);
      result.vin = extracted.vin || options.vin;
      result.buildSheet = extracted.buildSheet;
      result.model = extracted.model;
      result.engine = extracted.engine;
      result.scrapedAt = extracted.scrapedAt;
      const vinForResolve = extracted.vin || options.vin;
      const preferred = await resolveDetailListParent(
        vinForResolve,
        {
          partNumber: selectedPart.sku ?? "",
          description: selectedPart.description ?? "",
        },
        {
          fetchLike: (url) => targetPage.request.get(url),
        },
      ).catch(() => null);
      if (preferred) {
        status(
          `Looking in category: ${preferred.parentName}${preferred.subcategoryName ? ` > ${preferred.subcategoryName}` : ""}`,
        );
      } else {
        status(
          "Could not resolve category from catalog API; using AI to pick category.",
        );
      }
      status("Searching for selected part in detail list...");
      throwIfAborted(
        options.abortSignal,
        workTimeoutController?.signal.aborted,
      );
      const match = await findPartInDetailListByDescription(
        targetPage,
        {
          partNumber: selectedPart.sku ?? "",
          description: selectedPart.description ?? "",
          servicePartNumber: selectedPart.compatibility,
        },
        options.onStatus,
        [],
        preferred ?? undefined,
        options.abortSignal,
      );
      if (match) {
        result.parts = [{ ...selectedPart, section: match.section }];
        result.found = true;
      } else {
        result.parts = [selectedPart];
        result.found = false;
      }
      result.responseTimeMs = Date.now() - start;
      if (targetPage !== page) {
        await targetPage.close().catch(() => {});
      }
      return result;
    }

    lastStep = "openDetailList";
    status("Opening detail list...");
    throwIfAborted(options.abortSignal, workTimeoutController?.signal.aborted);
    await openDetailList(targetPage);

    lastStep = "extractBuildSheet";
    status("Extracting build sheet...");
    const extracted = await extractBuildSheet(targetPage);

    result.vin = extracted.vin || options.vin;
    result.buildSheet = extracted.buildSheet;
    result.model = extracted.model;
    result.engine = extracted.engine;
    result.scrapedAt = extracted.scrapedAt;

    if (options.skuQuery?.trim()) {
      result.parts = searchParts ?? [];
      result.found = result.parts.length > 0 || extracted.buildSheet.length > 0;
      result.noMatch = searchNoMatch;
    } else {
      result.parts = extracted.parts;
      result.found =
        extracted.buildSheet.length > 0 || extracted.parts.length > 0;
    }
    result.responseTimeMs = Date.now() - start;

    if (targetPage !== page) {
      await targetPage.close().catch(() => {});
    }
  } catch (err) {
    if (err instanceof ScraperCancelledError || options.abortSignal?.aborted) {
      result.cancelled = true;
      result.responseTimeMs = Date.now() - start;
      if (currentPage !== page) await currentPage.close().catch(() => {});
      return result;
    }
    let url: string | undefined;
    try {
      url = currentPage?.url?.();
    } catch {
      url = undefined;
    }
    await logScraperError(err, {
      step: lastStep,
      page: currentPage,
      url,
      vin: options.vin,
      cartName: options.cartName,
      skuQuery: options.skuQuery,
      screenshotsDir: config.screenshotsDir,
      logsDir: config.logsDir,
    });
    if (currentPage !== page) {
      await currentPage.close().catch(() => {});
    }
    throw err;
  } finally {
    disarmWorkTimeout();
    await browser.close().catch(() => {});
  }

  result.responseTimeMs = Date.now() - start;
  return result;
}
