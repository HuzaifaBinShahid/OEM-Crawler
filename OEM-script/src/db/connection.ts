import pg from "pg";
import type { Pool } from "pg";

import { loadConfig } from "../config.js";

const { Pool: PgPool } = pg;
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const config = loadConfig();
    pool = new PgPool({ connectionString: config.postgresUrl });
  }
  return pool;
}

export async function connectDb(): Promise<void> {
  const p = getPool();
  const client = await p.connect();
  client.release();
}

export async function disconnectDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
