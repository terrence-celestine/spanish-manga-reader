import pg from "pg";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

// Try loading environment variables from .env file
if (typeof process.loadEnvFile === "function") {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const envPath = join(__dirname, "..", "..", ".env");
    if (existsSync(envPath)) {
      process.loadEnvFile(envPath);
    } else {
      process.loadEnvFile();
    }
  } catch {
    // Ignore error if loading fails or file does not exist
  }
}

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy server/.env.example to server/.env and fill it in.",
  );
}

// Neon (and most managed Postgres) require SSL. Their connection strings include
// `sslmode=require`; enable SSL whenever that's requested.
const needsSsl =
  /sslmode=require/.test(connectionString) || process.env.PGSSL === "true";

export const pool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: 5,
});
