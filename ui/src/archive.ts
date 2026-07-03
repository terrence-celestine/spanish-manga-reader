// Extract page images from a .zip / .cbz / .cbr archive using libarchive.js
// (WASM). The worker + wasm are served from /public/libarchive (see
// scripts/copy-libarchive.mjs).
import { Archive } from "libarchive.js";

export interface Page {
  name: string;
  url: string;
}

const IMAGE_RE = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;

let initialized = false;
function ensureInit() {
  if (!initialized) {
    Archive.init({ workerUrl: "/libarchive/worker-bundle.js" });
    initialized = true;
  }
}

interface ArchiveEntry {
  file: { name: string; extract: () => Promise<File> };
  path?: string;
}

/** Natural (numeric-aware) comparison so page2 sorts before page10. */
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Open an archive and return its image pages in reading order.
 * Object URLs are created for each page; call revokePages() when done.
 */
export async function extractPages(file: File): Promise<Page[]> {
  ensureInit();
  const archive = await Archive.open(file);
  const entries = (await archive.getFilesArray()) as ArchiveEntry[];

  const images = entries
    .map((e) => ({ entry: e, full: `${e.path ?? ""}${e.file.name}` }))
    .filter(({ full }) => IMAGE_RE.test(full))
    .sort((a, b) => naturalCompare(a.full, b.full));

  const pages: Page[] = [];
  for (const { entry } of images) {
    const extracted = await entry.file.extract();
    pages.push({ name: entry.file.name, url: URL.createObjectURL(extracted) });
  }

  await archive.close?.();
  return pages;
}

export function revokePages(pages: Page[]): void {
  for (const p of pages) URL.revokeObjectURL(p.url);
}
