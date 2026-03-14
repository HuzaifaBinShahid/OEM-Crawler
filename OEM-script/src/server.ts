import "dotenv/config";
import http from "node:http";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import cors from "cors";
import express from "express";
import { createJob, resolveSelection } from "./job-store.js";
import { registerJobCancel, abortJob, clearJobCancel } from "./job-cancel.js";
import { ScraperCancelledError, ScraperTimeoutError } from "./scraper-cancelled-error.js";
import { loadConfig } from "./config.js";
import { connectDb, disconnectDb } from "./db/connection.js";
import { findVinLookup, saveVinLookup } from "./db/vin-lookup-repo.js";
import { runVinLookup } from "./runner.js";
import type { VinLookupResult } from "./runner.js";
import { logScraperError } from "./services/error-handler.js";

/** Generic message shown to client on error; exact error is only written to log files. */
const GENERIC_ERROR_MESSAGE = "An error occurred. Please try again later.";
/** Max time for active scraping in stream mode (ms). Not applied while awaiting user selection. */
const STREAM_SCRAPER_TIMEOUT_MS = 60000;

function apiResponse<T>(
  res: express.Response,
  status: number,
  data: T | null,
  message: string,
  error: string | null = null
): void {
  res.status(status).json({ data, message, error });
}

/** Use only for 500 errors: sends generic message to client, never the real error. */
function sendServerErrorResponse(res: express.Response): void {
  res.status(500).json({
    data: null,
    message: GENERIC_ERROR_MESSAGE,
    error: null,
  });
}

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN ?? true }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/vin-lookup", async (req, res) => {
  const vin = (req.query.vin as string)?.trim();
  const cartName = (req.query.cartName as string)?.trim() || "default-cart";
  const skuQuery = (req.query.skuQuery as string)?.trim() || undefined;

  if (!vin) {
    apiResponse(res, 400, null, "Bad request", "Missing required query: vin");
    return;
  }

  try {
    const cached = await findVinLookup({ vin, cartName, skuQuery });
    if (cached) {
      if (skuQuery && (!cached.found || (cached.parts && cached.parts.length === 0))) {
        const config = loadConfig();
        await logScraperError(new Error("Part was not found in the detail list for the given query."), {
          step: "api-get-part-not-found-cached",
          vin,
          cartName,
          skuQuery,
          screenshotsDir: config.screenshotsDir,
          logsDir: config.logsDir,
        });
        apiResponse(res, 404, null, "Part was not found in the detail list for the given query.", null);
        return;
      }
      const response: VinLookupResult = { ...cached, cached: true };
      apiResponse(res, 200, response, "Success", null);
      return;
    }
  } catch (err) {
    console.error("[api] DB find error:", err);
    const config = loadConfig();
    await logScraperError(err, {
      step: "api-get",
      vin,
      cartName,
      skuQuery,
      screenshotsDir: config.screenshotsDir,
      logsDir: config.logsDir,
    });
    sendServerErrorResponse(res);
    return;
  }

  try {
    const result = await runVinLookup({ vin, cartName, skuQuery });
    if (skuQuery && (!result.found || (result.parts && result.parts.length === 0))) {
      const config = loadConfig();
      await logScraperError(new Error("Part was not found in the detail list for the given query."), {
        step: "api-get-part-not-found",
        vin,
        cartName,
        skuQuery,
        screenshotsDir: config.screenshotsDir,
        logsDir: config.logsDir,
      });
      apiResponse(res, 404, null, "Part was not found in the detail list for the given query.", null);
      return;
    }
    await saveVinLookup({ vin, cartName, skuQuery }, result);
    apiResponse(res, 200, result, "Success", null);
  } catch (err) {
    console.error("[api] Scraper error:", err);
    const config = loadConfig();
    await logScraperError(err, {
      step: "api-get-scraper",
      vin,
      cartName,
      skuQuery,
      screenshotsDir: config.screenshotsDir,
      logsDir: config.logsDir,
    });
    sendServerErrorResponse(res);
  }
});

app.post("/api/vin-lookup", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const vin = typeof body?.vin === "string" ? body.vin.trim() : "";
  const cartName =
    typeof body?.cartName === "string" ? body.cartName.trim() : "default-cart";
  const skuQuery =
    typeof body?.skuQuery === "string" ? body.skuQuery.trim() || undefined : undefined;

  if (!vin) {
    apiResponse(res, 400, null, "Bad request", "Missing required body field: vin");
    return;
  }

  try {
    const cached = await findVinLookup({ vin, cartName, skuQuery });
    if (cached) {
      if (skuQuery && (!cached.found || (cached.parts && cached.parts.length === 0))) {
        const config = loadConfig();
        await logScraperError(new Error("Part was not found in the detail list for the given query."), {
          step: "api-post-part-not-found-cached",
          vin,
          cartName,
          skuQuery,
          screenshotsDir: config.screenshotsDir,
          logsDir: config.logsDir,
        });
        apiResponse(res, 404, null, "Part was not found in the detail list for the given query.", null);
        return;
      }
      const response: VinLookupResult = { ...cached, cached: true };
      apiResponse(res, 200, response, "Success", null);
      return;
    }
  } catch (err) {
    console.error("[api] DB find error:", err);
    const config = loadConfig();
    await logScraperError(err, {
      step: "api-post",
      vin,
      cartName,
      skuQuery,
      screenshotsDir: config.screenshotsDir,
      logsDir: config.logsDir,
    });
    sendServerErrorResponse(res);
    return;
  }

  try {
    const result = await runVinLookup({ vin, cartName, skuQuery });
    if (skuQuery && (!result.found || (result.parts && result.parts.length === 0))) {
      const config = loadConfig();
      await logScraperError(new Error("Part was not found in the detail list for the given query."), {
        step: "api-post-part-not-found",
        vin,
        cartName,
        skuQuery,
        screenshotsDir: config.screenshotsDir,
        logsDir: config.logsDir,
      });
      apiResponse(res, 404, null, "Part was not found in the detail list for the given query.", null);
      return;
    }
    await saveVinLookup({ vin, cartName, skuQuery }, result);
    apiResponse(res, 200, result, "Success", null);
  } catch (err) {
    console.error("[api] Scraper error:", err);
    const config = loadConfig();
    await logScraperError(err, {
      step: "api-post-scraper",
      vin,
      cartName,
      skuQuery,
      screenshotsDir: config.screenshotsDir,
      logsDir: config.logsDir,
    });
    sendServerErrorResponse(res);
  }
});

app.post("/api/vin-lookup/stream/select", (req, res) => {
  const body = req.body as {
    jobId?: string;
    selectedPart?: { sku?: string; description?: string; section?: string; compatibility?: string };
    partIndex?: number;
    selections?: Array<{ termIndex: number; selectedPart: { sku?: string; description?: string; section?: string; compatibility?: string } }>;
  };
  const jobId = typeof body?.jobId === "string" ? body.jobId.trim() : "";
  const selections = Array.isArray(body?.selections) ? body.selections : undefined;
  const selectedPart = body?.selectedPart && typeof body.selectedPart === "object" ? body.selectedPart : undefined;
  const partIndex = typeof body?.partIndex === "number" ? body.partIndex : undefined;

  if (!jobId) {
    res.status(400).json({ data: null, message: "Bad request", error: "Missing jobId" });
    return;
  }
  if (selections && selections.length > 0) {
    const valid = selections.every(
      (s) => typeof s.termIndex === "number" && s.selectedPart && typeof s.selectedPart === "object"
    );
    if (!valid) {
      res.status(400).json({ data: null, message: "Bad request", error: "Invalid selections" });
      return;
    }
    const ok = resolveSelection(jobId, { selections });
    if (!ok) {
      console.warn("[api] stream/select: job not found or already resolved, jobId=", jobId);
      res.status(404).json({ data: null, message: "Job not found or already resolved", error: null });
      return;
    }
    res.status(200).json({ data: { ok: true }, message: "Success", error: null });
    return;
  }
  if (!selectedPart) {
    res.status(400).json({ data: null, message: "Bad request", error: "Missing selectedPart or selections" });
    return;
  }
  const ok = resolveSelection(jobId, { selectedPart, partIndex });
  if (!ok) {
    console.warn("[api] stream/select: job not found or already resolved, jobId=", jobId);
    res.status(404).json({ data: null, message: "Job not found or already resolved", error: null });
    return;
  }
  res.status(200).json({ data: { ok: true }, message: "Success", error: null });
});

app.post("/api/vin-lookup/stream/stop", (req, res) => {
  const body = req.body as { jobId?: string };
  const jobId = typeof body?.jobId === "string" ? body.jobId.trim() : "";
  if (!jobId) {
    res.status(400).json({ data: null, message: "Bad request", error: "Missing jobId" });
    return;
  }
  abortJob(jobId);
  resolveSelection(jobId, { stop: true });
  res.status(200).json({ data: { ok: true }, message: "Success", error: null });
});

/** Save a "part not found" result manually with user-edited section/subcategory. POST body: { vin, cartName, skuQuery, result } where result has found: true and parts with section (and optional subcategory) set. */
app.post("/api/vin-lookup/save-manual", async (req, res) => {
  const body = req.body as {
    vin?: string;
    cartName?: string;
    skuQuery?: string;
    result?: { vin?: string; found?: boolean; parts?: Array<{ sku?: string; description?: string; section?: string; compatibility?: string }>; buildSheet?: unknown; model?: string; engine?: string; responseTimeMs?: number; cached?: boolean; scrapedAt?: string };
  };
  const vin = (body?.vin ?? "").trim();
  const cartName = (body?.cartName ?? "").trim() || vin;
  const skuQuery = (body?.skuQuery ?? "").trim();
  const result = body?.result;

  if (!vin) {
    res.status(400).json({ data: null, message: "Bad request", error: "Missing vin" });
    return;
  }
  if (!result || !result.parts || result.parts.length === 0) {
    res.status(400).json({ data: null, message: "Bad request", error: "Missing result with parts" });
    return;
  }

  const toSave = {
    vin: result.vin || vin,
    found: true,
    parts: result.parts,
    buildSheet: result.buildSheet,
    model: result.model,
    engine: result.engine,
    responseTimeMs: result.responseTimeMs ?? 0,
    cached: false,
    scrapedAt: result.scrapedAt,
  };

  try {
    await saveVinLookup({ vin, cartName, skuQuery }, toSave);
    res.status(200).json({ data: toSave, message: "Saved", error: null });
  } catch (err) {
    console.error("[api] save-manual error:", err);
    res.status(500).json({ data: null, message: "Failed to save", error: String(err) });
  }
});

/** Server-Sent Events stream for VIN lookup with live status messages. GET with ?vin=...&cartName=...&skuQuery=... */
app.get("/api/vin-lookup/stream", async (req, res) => {
  const vin = (req.query.vin as string)?.trim();
  const cartName = (req.query.cartName as string)?.trim() || "default-cart";
  const skuQuery = (req.query.skuQuery as string)?.trim() || undefined;

  if (!vin) {
    res.status(400).json({ data: null, message: "Bad request", error: "Missing required query: vin" });
    return;
  }

  function sendEvent(type: "status" | "result" | "error" | "awaiting_selection", payload: unknown): void {
    const line = JSON.stringify({ type, ...(typeof payload === "object" && payload !== null ? payload : { data: payload }) });
    res.write(`data: ${line}\n\n`);
    if (typeof (res as NodeJS.WritableStream & { flush?: () => void }).flush === "function") {
      (res as NodeJS.WritableStream & { flush: () => void }).flush();
    }
  }

  try {
    const cached = await findVinLookup({ vin, cartName, skuQuery });
    if (cached) {
      if (skuQuery && !cached.found && (!cached.parts || cached.parts.length === 0)) {
        const config = loadConfig();
        await logScraperError(new Error("Part was not found in the detail list for the given query."), {
          step: "api-stream-part-not-found-cached",
          vin,
          cartName,
          skuQuery,
          screenshotsDir: config.screenshotsDir,
          logsDir: config.logsDir,
        });
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
        sendEvent("error", { message: "Part was not found in the detail list for the given query." });
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
      sendEvent("status", { message: "Loaded from cache." });
      sendEvent("result", { data: { ...cached, cached: true } });
      res.end();
      return;
    }
  } catch (err) {
    console.error("[api] stream DB find error:", err);
    const config = loadConfig();
    await logScraperError(err, {
      step: "api-stream",
      vin,
      cartName,
      skuQuery,
      screenshotsDir: config.screenshotsDir,
      logsDir: config.logsDir,
    });
    res.status(500).json({ data: null, message: GENERIC_ERROR_MESSAGE, error: null });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const onStatus = (message: string) => {
    try {
      sendEvent("status", { message });
    } catch {
      // client may have disconnected
    }
  };

  let jobId: string | undefined;
  let selectionPromise: ReturnType<typeof createJob>["promise"] | undefined;
  let abortSignal: AbortSignal | undefined;
  if (skuQuery) {
    const job = createJob();
    jobId = job.jobId;
    selectionPromise = job.promise;
    abortSignal = registerJobCancel(jobId);
  }

  try {
    const result = await runVinLookup({
      vin,
      cartName,
      skuQuery,
      onStatus,
      jobId,
      abortSignal,
      scraperTimeoutMs: STREAM_SCRAPER_TIMEOUT_MS,
      onAwaitingSelection:
        jobId !== undefined
          ? (payload) => {
              try {
                sendEvent("awaiting_selection", { jobId, parts: payload.parts, suggestedPart: payload.suggestedPart, partsPerTerm: payload.partsPerTerm });
              } catch {
                // client may have disconnected
              }
            }
          : undefined,
      waitForSelection: selectionPromise ? () => selectionPromise! : undefined,
    });
    if (result.cancelled) {
      sendEvent("error", { message: "Process was stopped." });
      return;
    }
    if (skuQuery && !result.found && (!result.parts || result.parts.length === 0)) {
      const config = loadConfig();
      const errorMsg = result.noMatch ? "No matches found for this record." : "Part was not found in the detail list for the given query.";
      await logScraperError(new Error(errorMsg), {
        step: "api-stream-part-not-found",
        vin,
        cartName,
        skuQuery,
        screenshotsDir: config.screenshotsDir,
        logsDir: config.logsDir,
      });
      sendEvent("error", { message: errorMsg });
      res.end();
      return;
    }
    if (skuQuery && result.found) {
      await saveVinLookup({ vin, cartName, skuQuery }, result);
    }
    sendEvent("result", { data: result });
  } catch (err) {
    if (err instanceof ScraperCancelledError) {
      try {
        sendEvent("error", { message: "Process was stopped." });
      } catch {
        // ignore: client may have disconnected
      }
      return;
    }

    const clientMessage = getStreamErrorMessage(err);
    try {
      sendEvent("error", { message: clientMessage });
    } catch {
      // ignore: if the connection is already closed, the frontend will surface a network error
    }

    if (!(err instanceof ScraperCancelledError) && !(err instanceof ScraperTimeoutError)) {
      console.error("[api] stream scraper error:", err);
      try {
        const config = loadConfig();
        await logScraperError(err, {
          step: "api-stream-scraper",
          vin,
          cartName,
          skuQuery,
          screenshotsDir: config.screenshotsDir,
          logsDir: config.logsDir,
        });
      } catch (logErr) {
        console.error("[api] failed to log stream scraper error:", logErr);
      }
    }
  } finally {
    if (jobId) clearJobCancel(jobId);
    res.end();
  }
});

function getStreamErrorMessage(err: unknown): string {
  if (err instanceof ScraperCancelledError) return "Process was stopped.";
  if (err instanceof ScraperTimeoutError) return "Request timed out. Please try again.";
  const errMessage = err instanceof Error ? err.message : String(err);
  const isBrowserClosed =
    /target page, context or browser has been closed/i.test(errMessage) ||
    /browser has been closed/i.test(errMessage);
  return isBrowserClosed ? "The search was interrupted. Please try again." : GENERIC_ERROR_MESSAGE;
}

async function main(): Promise<void> {
  const config = loadConfig();
  await connectDb();

  const server = http.createServer(app);

  const wss = new WebSocketServer({ server, path: "/api/vin-lookup/ws" });
  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
    const vin = (url.searchParams.get("vin") ?? "").trim();
    const cartName = (url.searchParams.get("cartName") ?? "").trim() || "default-cart";
    const skuQuery = (url.searchParams.get("skuQuery") ?? "").trim() || undefined;

    const send = (obj: object) => {
      try {
        if (ws.readyState === 1) ws.send(JSON.stringify(obj));
      } catch {
        // ignore
      }
    };

    if (!vin) {
      send({ type: "error", message: "Missing required query: vin" });
      ws.close();
      return;
    }

    try {
      const cached = await findVinLookup({ vin, cartName, skuQuery });
      if (cached) {
        if (skuQuery && !cached.found && (!cached.parts || cached.parts.length === 0)) {
          send({ type: "error", message: "Part was not found in the detail list for the given query." });
          ws.close();
          return;
        }
        send({ type: "status", message: "Loaded from cache." });
        send({ type: "result", data: { ...cached, cached: true } });
        ws.close();
        return;
      }
    } catch (err) {
      console.error("[api] ws DB find error:", err);
      send({ type: "error", message: GENERIC_ERROR_MESSAGE });
      ws.close();
      return;
    }

    let jobId: string | undefined;
    let selectionPromise: ReturnType<typeof createJob>["promise"] | undefined;
    let abortSignal: AbortSignal | undefined;
    if (skuQuery) {
      const job = createJob();
      jobId = job.jobId;
      selectionPromise = job.promise;
      abortSignal = registerJobCancel(jobId);
    }

    try {
      const result = await runVinLookup({
        vin,
        cartName,
        skuQuery,
        onStatus: (message) => send({ type: "status", message }),
        jobId,
        abortSignal,
        scraperTimeoutMs: STREAM_SCRAPER_TIMEOUT_MS,
        onAwaitingSelection:
          jobId !== undefined
            ? (payload) => send({ type: "awaiting_selection", jobId, parts: payload.parts, suggestedPart: payload.suggestedPart, partsPerTerm: payload.partsPerTerm })
            : undefined,
        waitForSelection: selectionPromise ? () => selectionPromise! : undefined,
      });

      if (result.cancelled) {
        send({ type: "error", message: "Process was stopped." });
        ws.close();
        return;
      }
      if (skuQuery && !result.found && (!result.parts || result.parts.length === 0)) {
        const errorMsg = result.noMatch ? "No matches found for this record." : "Part was not found in the detail list for the given query.";
        send({ type: "error", message: errorMsg });
        ws.close();
        return;
      }
      if (skuQuery && result.found) {
        await saveVinLookup({ vin, cartName, skuQuery }, result);
      }
      send({ type: "result", data: result });
      ws.close();
    } catch (err) {
      const clientMessage = getStreamErrorMessage(err);
      send({ type: "error", message: clientMessage });
      console.error("[api] ws scraper error:", err);
      try {
        await logScraperError(err, {
          step: "api-ws-scraper",
          vin,
          cartName,
          skuQuery,
          screenshotsDir: config.screenshotsDir,
          logsDir: config.logsDir,
        });
      } catch (logErr) {
        console.error("[api] failed to log ws scraper error:", logErr);
      }
      ws.close();
    } finally {
      if (jobId) clearJobCancel(jobId);
    }
  });

  server.listen(config.apiPort, () => {
    console.log(`API listening on http://localhost:${config.apiPort}`);
    console.log("  GET  /api/vin-lookup?vin=...&cartName=...&skuQuery=...");
    console.log("  GET  /api/vin-lookup/stream?vin=... (SSE with live status)");
    console.log("  WS   /api/vin-lookup/ws?vin=...&cartName=...&skuQuery=... (preferred for live status + errors)");
    console.log("  POST /api/vin-lookup with JSON { vin, cartName?, skuQuery? }");
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

process.on("SIGINT", () => {
  disconnectDb().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  disconnectDb().then(() => process.exit(0));
});
