import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

export interface Config {
  loginUrl: string;
  dashboardUrl: string;
  /** Direct URL to part search (cart + VIN) page; when set, used when already logged in and to open part search. */
  partSearchUrl: string;
  navistarPortalBaseUrl: string;
  username: string;
  password: string;
  timeout: number;
  navigationTimeout: number;
  sessionProfilePath: string;
  sessionStatePath: string;
  logsDir: string;
  screenshotsDir: string;
  postgresUrl: string;
  apiPort: number;
  openaiApiKey: string;
  jwtSecret: string;
  jwtExpiresIn: string;
}

function getEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value !== undefined && value !== "" ? value : fallback;
}

export function loadConfig(): Config {
  const storageDir = path.resolve(
    process.cwd(),
    getEnv("REPAIRLINK_SESSION_STORAGE", "storage"),
  );
  const sessionProfilePath = path.join(
    storageDir,
    "repairlink-browser-profile",
  );
  const sessionStatePath = path.join(storageDir, "repairlink-state.json");
  try {
    fs.mkdirSync(storageDir, { recursive: true });
  } catch {
    // ignore
  }
  const logsDir = path.resolve(
    process.cwd(),
    getEnv("REPAIRLINK_LOGS_DIR", "logs"),
  );
  const screenshotsDir = path.join(logsDir, "screenshots");
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    fs.mkdirSync(screenshotsDir, { recursive: true });
  } catch {
    // ignore
  }
  return {
    loginUrl: getEnv(
      "REPAIRLINK_LOGIN_URL",
      "https://repairlinkshop.com/Account/Login",
    ),
    dashboardUrl: getEnv(
      "REPAIRLINK_DASHBOARD_URL",
      "https://repairlinkshop.com/#/0",
    ),
    partSearchUrl: getEnv(
      "REPAIRLINK_PART_SEARCH_URL",
      "https://repairlinkshop.com/HeavyDutyCatalog/PartSearch#/partlist/split/0",
    ),
    navistarPortalBaseUrl: getEnv(
      "NAVISTAR_PORTAL_BASE_URL",
      "https://oecnpc.navistar.com",
    ),
    username: getEnv("REPAIRLINK_USER", ""),
    password: getEnv("REPAIRLINK_PASSWORD", ""),
    timeout: 30_000,
    navigationTimeout: 60_000,
    sessionProfilePath,
    sessionStatePath,
    logsDir,
    screenshotsDir,
    postgresUrl: getEnv(
      "POSTGRES_URL",
      "postgresql://postgres:postgres@localhost:5432/oem_vin",
    ),
    apiPort: parseInt(getEnv("API_PORT", "3000"), 10) || 3000,
    openaiApiKey: getEnv("OPEN_AI_API_KEY", "") || getEnv("OPENAI_API_KEY", ""),
    jwtSecret: getEnv("JWT_SECRET", "dev-secret-change-in-production"),
    jwtExpiresIn: getEnv("JWT_EXPIRES_IN", "7d"),
  };
}
