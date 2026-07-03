import { pool } from "./db.js";

export interface DictEntry {
  lemma: string;
  pos: string;
  glosses: string[];
  freqRank: number | null;
}

export interface LookupResult {
  word: string;
  normalized: string;
  entries: DictEntry[];
}

/** Lowercase + trim. Accents are meaningful in Spanish, so we keep them. */
function normalize(word: string): string {
  return word.toLowerCase().trim();
}

/** Strip diacritics for an accent-insensitive fallback match. */
function accentFold(word: string): string {
  return word.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Look up a Spanish word:
 *  1. resolve inflected form -> lemma(s) via `forms` (also treat the word itself
 *     as a possible lemma),
 *  2. fetch English glosses for those lemmas from `entries`,
 *  3. order by frequency (most common lemma first).
 * Falls back to an accent-insensitive form match when nothing is found.
 */
export async function lookup(rawWord: string): Promise<LookupResult> {
  const normalized = normalize(rawWord);
  const entries = await lookupNormalized(normalized);

  if (entries.length === 0) {
    // Accent-insensitive fallback (e.g. user typed "estas" for "estás").
    const folded = accentFold(normalized);
    if (folded !== normalized) {
      const alt = await pool.query<{ lemma: string }>(
        `SELECT DISTINCT lemma FROM forms WHERE form_folded = $1`,
        [folded],
      );
      const lemmas = alt.rows.map((r) => r.lemma);
      if (lemmas.length > 0) {
        return { word: rawWord, normalized, entries: await entriesForLemmas(lemmas) };
      }
    }
  }

  return { word: rawWord, normalized, entries };
}

async function lookupNormalized(normalized: string): Promise<DictEntry[]> {
  // Candidate lemmas: those the form maps to, plus the word itself.
  const formRows = await pool.query<{ lemma: string }>(
    `SELECT lemma FROM forms WHERE form = $1`,
    [normalized],
  );
  const lemmas = new Set<string>(formRows.rows.map((r) => r.lemma));
  lemmas.add(normalized);
  return entriesForLemmas([...lemmas]);
}

async function entriesForLemmas(lemmas: string[]): Promise<DictEntry[]> {
  if (lemmas.length === 0) return [];
  const res = await pool.query<{
    lemma: string;
    pos: string;
    glosses: string[];
    rank: number | null;
  }>(
    `SELECT e.lemma, e.pos, e.glosses, f.rank
     FROM entries e
     LEFT JOIN frequency f ON f.lemma = e.lemma
     WHERE e.lemma = ANY($1::text[])
     ORDER BY f.rank NULLS LAST, e.lemma, e.pos`,
    [lemmas],
  );
  return res.rows.map((r) => ({
    lemma: r.lemma,
    pos: r.pos,
    glosses: r.glosses,
    freqRank: r.rank,
  }));
}
