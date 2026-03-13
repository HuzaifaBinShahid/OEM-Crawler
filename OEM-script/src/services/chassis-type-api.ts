/**
 * Calls Navistar ChassisType API to resolve the exact Detail List parent (and subcategory)
 * from the search response's figVartnId, so we only open that category.
 */

import { loadConfig } from "../config.js";

/** Optional: use this when calling from a browser context so requests use the same session/cookies. */
export type ChassisTypeFetcher = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

const normalizePartNumber = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export interface ChassisTypePart {
  partNumber?: string;
  partDesc?: string;
  figVartnId?: number;
  figURL?: string;
  grpCatlgDesc?: string;
  figDesc?: string;
}

interface ChassisTypeTreeNode {
  text?: string;
  partsUrl?: string;
  figureUrl?: string;
  nodes?: ChassisTypeTreeNode[];
}

interface ChassisTypeTreeResponse {
  nodes?: ChassisTypeTreeNode[];
  chassisNumber?: string;
}

function buildSearchUrl(vin: string, nounDesc: string): string {
  const config = loadConfig();
  const base = config.navistarPortalBaseUrl.replace(/\/$/, "");
  return `${base}/npc/myportal/ChassisType?chassis_no=${encodeURIComponent(vin)}&nounDesc=${encodeURIComponent(nounDesc)}&chass_id=&_=${Date.now()}`;
}

function buildTreeUrl(vin: string): string {
  const config = loadConfig();
  const base = config.navistarPortalBaseUrl.replace(/\/$/, "");
  return `${base}/npc/myportal/ChassisType?chassis_no=${encodeURIComponent(vin)}&chass_id=&vin=${encodeURIComponent(vin)}&_=${Date.now()}`;
}

/**
 * GET ChassisType?chassis_no=vin&nounDesc=... (search by part name/description).
 * Returns array of parts; each may have figVartnId, partNumber, etc.
 * When fetchLike is provided (e.g. from Playwright page.request), uses that so the request runs with the page's cookies.
 */
export async function fetchChassisTypeSearch(
  vin: string,
  nounDesc: string,
  fetchLike?: ChassisTypeFetcher
): Promise<ChassisTypePart[]> {
  const url = buildSearchUrl(vin, nounDesc);
  const res = fetchLike
    ? await fetchLike(url)
    : await fetch(url, { method: "GET", signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json) ? json as ChassisTypePart[] : [];
}

/**
 * GET ChassisType?chassis_no=vin&chass_id=&vin=vin (tree without nounDesc).
 * Returns tree with nodes[].text, partsUrl, figureUrl, nodes[].
 */
export async function fetchChassisTypeTree(
  vin: string,
  fetchLike?: ChassisTypeFetcher
): Promise<ChassisTypeTreeResponse> {
  const url = buildTreeUrl(vin);
  const res = fetchLike
    ? await fetchLike(url)
    : await fetch(url, { method: "GET", signal: AbortSignal.timeout(15000) });
  if (!res.ok) return {};
  const json = await res.json();
  return (json && typeof json === "object") ? json as ChassisTypeTreeResponse : {};
}

function urlContainsVartnId(url: string | undefined, vartnId: number): boolean {
  if (!url || vartnId == null) return false;
  const idStr = String(vartnId);
  return (
    url.includes(`vartn_id=${idStr}`) ||
    url.includes(`vartn_id=${idStr},`) ||
    url.includes(`,${idStr}`) ||
    url.includes(`parent_part_id=${idStr}`)
  );
}

/**
 * Recursively find a tree node whose partsUrl or figureUrl contains the given vartnId.
 * Returns { parentName, subcategoryName } where parentName is the root category (e.g. "Engines")
 * and subcategoryName is the matching node's text (e.g. "ACCEL PEDAL ASM") if it's not a root.
 */
function findNodeByVartnId(
  nodes: ChassisTypeTreeNode[] | undefined,
  vartnId: number,
  rootName?: string
): { parentName: string; subcategoryName?: string } | null {
  if (!nodes || !Array.isArray(nodes)) return null;
  for (const node of nodes) {
    const text = (node.text || "").trim();
    const partsUrl = node.partsUrl || "";
    const figureUrl = node.figureUrl || "";
    if (urlContainsVartnId(partsUrl, vartnId) || urlContainsVartnId(figureUrl, vartnId)) {
      const parentName = rootName ?? text;
      const subcategoryName = rootName ? text : undefined;
      return { parentName, subcategoryName };
    }
    if (node.nodes && node.nodes.length > 0) {
      const nextRoot = rootName ?? text;
      const found = findNodeByVartnId(node.nodes, vartnId, nextRoot);
      if (found) return found;
    }
  }
  return null;
}

export interface ResolvedDetailListParent {
  parentName: string;
  subcategoryName?: string;
}

/**
 * Resolve the exact Detail List parent (and optional subcategory) for the selected part
 * by calling the ChassisType search API, finding the matching part's figVartnId,
 * then finding the tree node that contains that vartn_id.
 * Pass fetchLike (e.g. page.request.get from Playwright) so requests use the browser session.
 */
export async function resolveDetailListParent(
  vin: string,
  selectedPart: { partNumber: string; description?: string },
  options?: { fetchLike?: ChassisTypeFetcher }
): Promise<ResolvedDetailListParent | null> {
  const partNum = (selectedPart.partNumber || "").trim();
  const nounDesc = partNum || (selectedPart.description || "").trim();
  if (!nounDesc) return null;

  const fetchLike = options?.fetchLike;

  let parts: ChassisTypePart[];
  try {
    parts = await fetchChassisTypeSearch(vin, nounDesc, fetchLike);
  } catch {
    return null;
  }
  if (!parts.length) return null;

  const targetNorm = normalizePartNumber(partNum);
  const match = parts.find((p) => {
    const pn = (p.partNumber || "").trim();
    return pn && (normalizePartNumber(pn) === targetNorm || normalizePartNumber(pn).includes(targetNorm) || targetNorm.includes(normalizePartNumber(pn)));
  });
  if (!match) return null;

  const figVartnId = match.figVartnId;
  if (figVartnId == null) return null;

  let tree: ChassisTypeTreeResponse;
  try {
    tree = await fetchChassisTypeTree(vin, fetchLike);
  } catch {
    return null;
  }

  const topNodes = tree.nodes;
  if (!topNodes || !Array.isArray(topNodes)) return null;
  // Top level is usually [ { text: chassisNumber, nodes: [ root categories ] } ]
  let categories: ChassisTypeTreeNode[] | undefined;
  for (const n of topNodes) {
    if (n.nodes && n.nodes.length > 0) {
      categories = n.nodes;
      break;
    }
  }
  if (!categories) return null;

  return findNodeByVartnId(categories, figVartnId) ?? null;
}
