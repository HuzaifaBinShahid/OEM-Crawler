import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { getPool } from "./connection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Run schema.sql and all migrations. Safe to call multiple times. Does not close the pool. */
export async function runMigrations(): Promise<void> {
  const pool = getPool();
  const schemaPath = path.join(__dirname, "schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(schemaSql);
  const migrationsDir = path.join(__dirname, "migrations");
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      await pool.query(sql);
    }
  }
}

async function main(): Promise<void> {
  loadConfig();
  await runMigrations();
  console.log("Schema and migrations applied successfully.");
  const pool = getPool();
  await pool.end();
}

const __filename = fileURLToPath(import.meta.url);
const isEntry = process.argv[1] === __filename;
if (isEntry) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
