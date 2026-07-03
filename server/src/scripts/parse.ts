// Pure parsers for the doozan/spanish_data files. No DB, no network — so they
// can be unit-tested on small string samples.

export interface EntryRow {
  lemma: string;
  pos: string;
  glosses: string[];
}

export interface FormRow {
  form: string;
  pos: string;
  lemma: string;
}

export interface FreqRow {
  lemma: string;
  rank: number;
}

/**
 * Parse `es-en.data` (enwiktionary_wordlist format):
 *
 *   _____
 *   estar
 *   pos: v
 *     meta: {{es-verb}}
 *     gloss: to be (location, state)
 *     gloss: to stay
 *   pos: n
 *     gloss: ...
 *
 * Entries are separated by a line that is exactly "_____". Within an entry the
 * headword is the first line; `pos:` (column 0) starts a part-of-speech block;
 * `  gloss:` (indented) lines are the English definitions.
 */
export function parseEsEnData(text: string): EntryRow[] {
  const rows: EntryRow[] = [];
  const blocks = text.split(/^_____$/m);

  for (const block of blocks) {
    const lines = block.split("\n");
    let headword = "";
    for (const line of lines) {
      if (line.trim() !== "") {
        headword = line.trim();
        break;
      }
    }
    if (!headword) continue;

    let current: EntryRow | null = null;
    for (const line of lines) {
      const posMatch = /^pos:\s*(.+)$/.exec(line);
      if (posMatch) {
        if (current && current.glosses.length > 0) rows.push(current);
        current = { lemma: headword.toLowerCase(), pos: posMatch[1]!.trim(), glosses: [] };
        continue;
      }
      const glossMatch = /^\s+gloss:\s*(.+)$/.exec(line);
      if (glossMatch && current) {
        current.glosses.push(glossMatch[1]!.trim());
      }
    }
    if (current && current.glosses.length > 0) rows.push(current);
  }

  return rows;
}

/**
 * Parse `es_allforms.csv`: `form,pos,lemma[,lemma2,...]`.
 * A form can resolve to multiple lemmas; we emit one row per (form, lemma).
 * Forms are lowercased to match normalized lookups.
 */
export function parseAllForms(text: string): FormRow[] {
  const rows: FormRow[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length < 3) continue;
    const form = parts[0]!.toLowerCase();
    const pos = parts[1]!;
    for (const lemma of parts.slice(2)) {
      if (lemma) rows.push({ form, pos, lemma: lemma.toLowerCase() });
    }
  }
  return rows;
}

/**
 * Parse `frequency.csv`: `count,spanish,pos,flags,usage` (already sorted most→least
 * frequent). Rank is the 1-based row order for the lemma (`spanish` column); the
 * first occurrence wins if a lemma repeats across parts of speech.
 */
export function parseFrequency(text: string): FreqRow[] {
  const rows: FreqRow[] = [];
  const seen = new Set<string>();
  const lines = text.split("\n");
  let rank = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const parts = line.split(",");
    // Skip header row.
    if (i === 0 && parts[0] === "count") continue;
    const lemma = parts[1]?.toLowerCase();
    if (!lemma || seen.has(lemma)) continue;
    seen.add(lemma);
    rank += 1;
    rows.push({ lemma, rank });
  }
  return rows;
}

/** Lowercase + strip diacritics, for accent-insensitive fallback matching. */
export function accentFold(word: string): string {
  return word
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
