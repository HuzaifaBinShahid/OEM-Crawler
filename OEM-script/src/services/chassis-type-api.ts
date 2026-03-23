import { loadConfig } from "../config.js";

export type ChassisTypeFetcher = (
  url: string,
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

const normalizePartNumber = (s: string) =>
  s.replace(/\s+/g, " ").trim().toLowerCase();

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

export async function fetchChassisTypeSearch(
  vin: string,
  nounDesc: string,
  fetchLike?: ChassisTypeFetcher,
): Promise<ChassisTypePart[]> {
  const url = buildSearchUrl(vin, nounDesc);
  const res = fetchLike
    ? await fetchLike(url)
    : await fetch(url, { method: "GET", signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json) ? (json as ChassisTypePart[]) : [];
}

export async function fetchChassisTypeTree(
  vin: string,
  fetchLike?: ChassisTypeFetcher,
): Promise<ChassisTypeTreeResponse> {
  const url = buildTreeUrl(vin);
  const res = fetchLike
    ? await fetchLike(url)
    : await fetch(url, { method: "GET", signal: AbortSignal.timeout(15000) });
  if (!res.ok) return {};
  const json = await res.json();
  return json && typeof json === "object"
    ? (json as ChassisTypeTreeResponse)
    : {};
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

function findNodeByVartnId(
  nodes: ChassisTypeTreeNode[] | undefined,
  vartnId: number,
  rootName?: string,
): { parentName: string; subcategoryName?: string } | null {
  if (!nodes || !Array.isArray(nodes)) return null;
  for (const node of nodes) {
    const text = (node.text || "").trim();
    const partsUrl = node.partsUrl || "";
    const figureUrl = node.figureUrl || "";
    if (
      urlContainsVartnId(partsUrl, vartnId) ||
      urlContainsVartnId(figureUrl, vartnId)
    ) {
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

export async function resolveDetailListParent(
  vin: string,
  selectedPart: { partNumber: string; description?: string },
  options?: { fetchLike?: ChassisTypeFetcher },
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
    return (
      pn &&
      (normalizePartNumber(pn) === targetNorm ||
        normalizePartNumber(pn).includes(targetNorm) ||
        targetNorm.includes(normalizePartNumber(pn)))
    );
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
