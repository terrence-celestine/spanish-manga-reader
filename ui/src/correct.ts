// Client for the OCR word-correction API. Sends the raw OCR words and gets back a
// dictionary-corrected list (fixes I↔l confusion like "sl" → "sí"). Falls back to
// the input words unchanged if the API is unreachable, so the reader still works.

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export async function correctWords(words: string[]): Promise<string[]> {
  if (words.length === 0) return words;
  try {
    const res = await fetch(`${API_BASE}/api/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ words }),
    });
    if (!res.ok) return words;
    const data = (await res.json()) as { words?: unknown };
    if (Array.isArray(data.words) && data.words.every((w) => typeof w === "string")) {
      return data.words as string[];
    }
    return words;
  } catch {
    return words;
  }
}
