import type { VinLookupResult } from "../runner.js";
import { getPool } from "./connection.js";

export interface VinLookupQuery {
  vin: string;
  cartName: string;
  skuQuery?: string;
}

const vinNorm = (v: string) => v.trim();
const cartNorm = (v: string) => v.trim() || "default-cart";
const skuNorm = (v: string | undefined) => (v ?? "").trim();

export async function findVinLookup(
  query: VinLookupQuery,
): Promise<VinLookupResult | null> {
  const pool = getPool();
  const vin = vinNorm(query.vin);
  const cartName = cartNorm(query.cartName);
  const skuQuery = skuNorm(query.skuQuery);
  const res = await pool.query(
    `SELECT result FROM vin_lookups
     WHERE query_vin = $1 AND query_cart_name = $2 AND query_sku_query = $3`,
    [vin, cartName, skuQuery],
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  const result = row?.result as unknown;
  return result as VinLookupResult;
}

export async function saveVinLookup(
  query: VinLookupQuery,
  result: VinLookupResult,
): Promise<void> {
  const pool = getPool();
  const vin = vinNorm(query.vin);
  const cartName = cartNorm(query.cartName);
  const skuQuery = skuNorm(query.skuQuery);
  const payload = { ...result, cached: false };
  await pool.query(
    `INSERT INTO vin_lookups (query_vin, query_cart_name, query_sku_query, result, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW())
     ON CONFLICT (query_vin, query_cart_name, query_sku_query)
     DO UPDATE SET result = EXCLUDED.result, updated_at = NOW()`,
    [vin, cartName, skuQuery, JSON.stringify(payload)],
  );
}
