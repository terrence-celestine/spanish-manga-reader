import pg from "pg";

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
