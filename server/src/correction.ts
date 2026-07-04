import { pool } from "./db.js";

/** Lowercase + trim (forms are stored lowercased). */
function normalize(word: string): string {
  return word.toLowerCase().trim();
}

/**
 * Generate OCR-confusion variants of a word. The main fix is the I↔l ambiguity
 * (tesseract reads "SÍ"/"SI" as "Sl" → "sl"); we also cover a few other frequent
 * Latin-OCR pairs. Each variant is tagged with how many substitutions it took, so
 * closer corrections win ties.
 */
function candidates(word: string): Map<string, number> {
  const out = new Map<string, number>();
  const add = (w: string, cost: number) => {
    if (!w) return;
    const prev = out.get(w);
    if (prev === undefined || cost < prev) out.set(w, cost);
  };

  add(word, 0);

  // Single-position l→i / l→í and i→l.
  for (let i = 0; i < word.length; i++) {
    const c = word[i];
    if (c === "l") {
      add(word.slice(0, i) + "i" + word.slice(i + 1), 1);
      add(word.slice(0, i) + "í" + word.slice(i + 1), 1);
    } else if (c === "i") {
      add(word.slice(0, i) + "l" + word.slice(i + 1), 1);
    }
  }

  // All-occurrences l→i / l→í (e.g. "lll" style runs).
  if (word.includes("l")) {
    add(word.replaceAll("l", "i"), 1);
    add(word.replaceAll("l", "í"), 1);
  }

  // Other common Latin-OCR merges.
  if (word.includes("rn")) add(word.replaceAll("rn", "m"), 1);
  if (word.includes("cl")) add(word.replaceAll("cl", "d"), 1);

  return out;
}

/**
 * Validate and correct OCR words against the dictionary. For each input word we
 * only swap in an OCR-confusion variant when it's clearly better: either the
 * original isn't a real word at all, or a valid variant is dramatically more common
 * (>= SWITCH_FACTOR× the frequency). This fixes `sl` → `sí`/`si` (`sl` is a rare
 * valid token, rank ~22k, vs `si` rank ~31) while leaving a correctly-read common
 * word (e.g. `sí`, rank ~34) untouched. Tokens that aren't real Spanish words
 * (SFX garble, character names) are dropped. De-dupes, preserving order.
 */
const SWITCH_FACTOR = 10;

export async function correctWords(words: string[]): Promise<string[]> {
  const normalized = words.map(normalize).filter(Boolean);
  if (normalized.length === 0) return [];

  // Collect every candidate across all words for a single validity query.
  const perWord = normalized.map((w) => candidates(w));
  const allCandidates = new Set<string>();
  for (const m of perWord) for (const c of m.keys()) allCandidates.add(c);

  const rankByWord = await validityRanks([...allCandidates]);

  const result: string[] = [];
  const seen = new Set<string>();
  for (const m of perWord) {
    const original = [...m.keys()][0]!; // cost-0 entry is the original word
    const originalRank = rankByWord.get(original); // undefined ⇒ not a real word

    // Best valid variant other than the original (lowest rank, then fewest edits).
    let best: { word: string; rank: number; cost: number } | null = null;
    for (const [cand, cost] of m) {
      if (cand === original) continue;
      const rank = rankByWord.get(cand);
      if (rank === undefined) continue;
      if (!best || rank < best.rank || (rank === best.rank && cost < best.cost)) {
        best = { word: cand, rank, cost };
      }
    }

    let chosen = original;
    if (best) {
      if (originalRank === undefined) {
        chosen = best.word; // original isn't a real word → take the valid variant
      } else if (best.rank * SWITCH_FACTOR < originalRank) {
        chosen = best.word; // variant is much more common → likely an OCR misread
      }
    }

    // Drop anything that isn't a real Spanish word (SFX garble, character names).
    if (rankByWord.has(chosen) && !seen.has(chosen)) {
      seen.add(chosen);
      result.push(chosen);
    }
  }
  return result;
}

/**
 * Return a map of word → best frequency rank for the candidates that exist in the
 * dictionary (as a form or a lemma). Absent from the map ⇒ not a real word.
 * Missing frequency is represented as Number.MAX_SAFE_INTEGER (ranked last).
 */
async function validityRanks(cands: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (cands.length === 0) return map;

  const res = await pool.query<{ w: string; rank: number | null }>(
    `SELECT f.form AS w, fr.rank
       FROM forms f
       LEFT JOIN frequency fr ON fr.lemma = f.lemma
      WHERE f.form = ANY($1::text[])
     UNION
     SELECT e.lemma AS w, fr.rank
       FROM entries e
       LEFT JOIN frequency fr ON fr.lemma = e.lemma
      WHERE e.lemma = ANY($1::text[])`,
    [cands],
  );

  for (const row of res.rows) {
    const rank = row.rank ?? Number.MAX_SAFE_INTEGER;
    const prev = map.get(row.w);
    if (prev === undefined || rank < prev) map.set(row.w, rank);
  }
  return map;
}
