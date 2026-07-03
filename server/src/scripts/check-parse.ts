// Dev utility: validate the parsers against the real data files (no DB needed).
// Run: npx tsx src/scripts/check-parse.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAllForms, parseEsEnData, parseFrequency } from "./parse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE = join(__dirname, "..", "..", ".cache");
const BASE = "https://raw.githubusercontent.com/doozan/spanish_data/master";

async function getFile(name: string): Promise<string> {
  const path = join(CACHE, name);
  if (existsSync(path)) return readFile(path, "utf8");
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`download ${name}: ${res.status}`);
  const text = await res.text();
  await mkdir(CACHE, { recursive: true });
  await writeFile(path, text, "utf8");
  return text;
}

const forms = parseAllForms(await getFile("es_allforms.csv"));
const entries = parseEsEnData(await getFile("es-en.data"));
const freq = parseFrequency(await getFile("frequency.csv"));

console.log(`forms=${forms.length} entries=${entries.length} freq=${freq.length}`);

function resolve(word: string) {
  const lemmas = new Set(forms.filter((f) => f.form === word).map((f) => f.lemma));
  lemmas.add(word);
  const defs = entries.filter((e) => lemmas.has(e.lemma));
  console.log(`\n"${word}" -> lemmas [${[...lemmas].join(", ")}]`);
  for (const d of defs.slice(0, 4)) {
    console.log(`   (${d.pos}) ${d.lemma}: ${d.glosses.slice(0, 2).join(" | ")}`);
  }
}

for (const w of ["corriste", "hablábamos", "mujeres", "hermosa", "bragas", "sirviente"]) {
  resolve(w);
}
console.log(`\nfreq rank of "de"=${freq.find((f) => f.lemma === "de")?.rank}`);
