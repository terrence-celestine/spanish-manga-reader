// Copy libarchive.js's worker + wasm into public/ so Vite serves them at a
// stable path. The worker resolves libarchive.wasm relative to itself, so both
// files must live in the same public folder. Runs on postinstall.
import { mkdir, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "libarchive.js", "dist");
const dest = join(root, "public", "libarchive");

await mkdir(dest, { recursive: true });
for (const f of ["worker-bundle.js", "libarchive.wasm"]) {
  await copyFile(join(src, f), join(dest, f));
}
console.log("Copied libarchive worker + wasm to public/libarchive");
