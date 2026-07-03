// Download the doozan/spanish_data files, parse them, and load them into
// Postgres/Neon. Run with: DATABASE_URL=... npm run build:dict -w server
//
// Files are cached under server/.cache so re-runs don't re-download.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import pg from "pg";
import { from as copyFrom } from "pg-copy-streams";
import {
  parseAllForms,
  parseEsEnData,
  parseFrequency,
  accentFold,
  type FormRow,
} from "./parse.js";

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE = join(__dirname, "..", "..", ".cache");
const BASE = "https://raw.githubusercontent.com/doozan/spanish_data/master";
const FILES = ["es-en.data", "es_allforms.csv", "frequency.csv"] as const;

async function getFile(name: string): Promise<string> {
  const path = join(CACHE, name);
  if (existsSync(path)) return readFile(path, "utf8");
  console.log(`Downloading ${name}…`);
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`Failed to download ${name}: ${res.status}`);
  const text = await res.text();
  await mkdir(CACHE, { recursive: true });
  await writeFile(path, text, "utf8");
  return text;
}

/** Escape a value for Postgres COPY text format. */
function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

async function copyRows(
  client: pg.PoolClient,
  sql: string,
  rows: Iterable<string[]>,
): Promise<void> {
  const stream = client.query(copyFrom(sql));
  for (const cols of rows) {
    const line = cols.map(esc).join("\t") + "\n";
    if (!stream.write(line)) await once(stream, "drain");
  }
  stream.end();
  await once(stream, "finish");
}

const SCHEMA = `
DROP TABLE IF EXISTS forms, entries, frequency;

CREATE TABLE entries (
  lemma   text NOT NULL,
  pos     text NOT NULL,
  glosses jsonb NOT NULL
);

CREATE TABLE forms (
  form        text NOT NULL,
  form_folded text NOT NULL,
  lemma       text NOT NULL,
  pos         text NOT NULL
);

CREATE TABLE frequency (
  lemma text PRIMARY KEY,
  rank  int  NOT NULL
);
`;

const INDEXES = `
CREATE INDEX idx_entries_lemma ON entries (lemma);
CREATE INDEX idx_forms_form ON forms (form);
CREATE INDEX idx_forms_folded ON forms (form_folded);
`;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const ssl =
    /sslmode=require/.test(connectionString) || process.env.PGSSL === "true"
      ? { rejectUnauthorized: false }
      : undefined;
  const pool = new Pool({ connectionString, ssl, max: 3 });

  const esEn = await getFile("es-en.data");
  const allForms = await getFile("es_allforms.csv");
  const freq = await getFile("frequency.csv");

  console.log("Parsing…");
  const entries = parseEsEnData(esEn);
  const forms: FormRow[] = parseAllForms(allForms);
  const frequency = parseFrequency(freq);
  console.log(
    `Parsed ${entries.length} entries, ${forms.length} forms, ${frequency.length} freq rows`,
  );

  const client = await pool.connect();
  try {
    console.log("Creating schema…");
    await client.query(SCHEMA);

    console.log("Loading entries…");
    await copyRows(
      client,
      "COPY entries (lemma, pos, glosses) FROM STDIN",
      (function* () {
        for (const e of entries) yield [e.lemma, e.pos, JSON.stringify(e.glosses)];
      })(),
    );

    console.log("Loading forms…");
    await copyRows(
      client,
      "COPY forms (form, form_folded, lemma, pos) FROM STDIN",
      (function* () {
        for (const f of forms) yield [f.form, accentFold(f.form), f.lemma, f.pos];
      })(),
    );

    console.log("Loading frequency…");
    await copyRows(
      client,
      "COPY frequency (lemma, rank) FROM STDIN",
      (function* () {
        for (const r of frequency) yield [r.lemma, String(r.rank)];
      })(),
    );

    console.log("Creating indexes…");
    await client.query(INDEXES);
    await client.query("ANALYZE");
  } finally {
    client.release();
  }

  await pool.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
