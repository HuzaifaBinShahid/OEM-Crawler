import { getPool } from "./connection.js";
import type { VinLookupResult } from "../runner.js";

export interface VinLookupQuery {
  vin: string;
  cartName: string;
  skuQuery?: string;
}

const vinNorm = (v: string) => v.trim();
const cartNorm = (v: string) => v.trim() || "default-cart";
const skuNorm = (v: string | undefined) => {
  const raw = (v ?? "").trim();
  if (!raw) return "";
  let text = raw.toLowerCase();
  text = text.replace(
    /^(i\s+need\s+|i\s+want\s+|need\s+|please\s+find\s+|please\s+)/,
    "",
  );
  text = text.replace(/[^a-z0-9]+/g, " ");
  text = text.trim().replace(/\s+/g, " ");
  return text;
};

export async function findVinLookup(
  query: VinLookupQuery,
  userId: number,
): Promise<VinLookupResult | null> {
  const pool = getPool();
  const vin = vinNorm(query.vin);
  const cartName = cartNorm(query.cartName);
  const skuQuery = skuNorm(query.skuQuery);
  const res = await pool.query(
    `SELECT result FROM vin_lookups
     WHERE user_id = $1 AND query_vin = $2 AND query_cart_name = $3 AND query_sku_query = $4
     ORDER BY created_at DESC LIMIT 1`,
    [userId, vin, cartName, skuQuery],
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  const result = row?.result as unknown;
  return result as VinLookupResult;
}

/** Insert a new lookup row (every query is stored separately for per-user history). */
export async function saveVinLookup(
  query: VinLookupQuery,
  result: VinLookupResult,
  userId: number,
): Promise<void> {
  const pool = getPool();
  const vin = vinNorm(query.vin);
  const cartName = cartNorm(query.cartName);
  const skuQuery = skuNorm(query.skuQuery);
  const payload = { ...result, cached: false };
  await pool.query(
    `INSERT INTO vin_lookups (user_id, query_vin, query_cart_name, query_sku_query, result, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW())`,
    [userId, vin, cartName, skuQuery, JSON.stringify(payload)],
  );
}

export interface UserLookupRecord {
  id: number;
  query_vin: string;
  query_cart_name: string;
  query_sku_query: string;
  created_at: Date;
}

export async function getLookupsByUserId(
  userId: number,
  limit = 100,
): Promise<{ total: number; lookups: UserLookupRecord[] }> {
  const pool = getPool();
  const countRes = await pool.query<{ total: string }>(
    "SELECT COUNT(*)::text AS total FROM vin_lookups WHERE user_id = $1",
    [userId],
  );
  const total = Number(countRes.rows[0]?.total ?? "0") || 0;
  const listRes = await pool.query<UserLookupRecord>(
    `SELECT id, query_vin, query_cart_name, query_sku_query, created_at
     FROM vin_lookups WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
  return { total, lookups: listRes.rows };
}

/**
 * Load recent successful lookups from internal/admin users for AI learning.
 * Returns the raw query + full JSONB result so the AI can learn from
 * everything stored in the database, not just code-defined examples.
 */
export interface DbLearnedLookup {
  query_sku_query: string;
  query_vin: string;
  result: VinLookupResult;
}

export async function getInternalUserLookups(
  limit = 200,
): Promise<DbLearnedLookup[]> {
  const pool = getPool();
  const res = await pool.query<DbLearnedLookup>(
    `SELECT vl.query_sku_query, vl.query_vin, vl.result
     FROM vin_lookups vl
     JOIN users u ON u.id = vl.user_id
     WHERE u.role IN ('admin', 'internal')
       AND vl.query_sku_query <> ''
       AND vl.result IS NOT NULL
     ORDER BY vl.created_at DESC
     LIMIT $1`,
    [limit],
  );
  return res.rows;
}
