// Client for the dictionary API. In dev, Vite proxies /api to the Fastify
// server (see vite.config.ts); in production the same server serves this app.

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

let API_BASE = (import.meta.env.VITE_API_URL || "").trim();
if (API_BASE && !API_BASE.startsWith("http://") && !API_BASE.startsWith("https://") && !API_BASE.startsWith("/")) {
  API_BASE = `https://${API_BASE}`;
}
API_BASE = API_BASE.replace(/\/$/, "");

export async function lookupWord(word: string): Promise<LookupResult> {
  const res = await fetch(`${API_BASE}/api/lookup?word=${encodeURIComponent(word)}`);
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
  return (await res.json()) as LookupResult;
}
