# spanish-manga-reader

Read Spanish manga in the browser. Open a `.zip` / `.cbz` / `.cbr`, page through it,
drag a box over a speech bubble to OCR just that region, then click a word for its
English definition from a self-hosted Spanish→English dictionary — conjugations
included (`corriste` → *correr* → "to run").

## How it works

1. **Open** an archive; pages are unpacked in the browser and shown one at a time.
2. **Select** — drag a box over text. Only that crop is sent to OCR (tesseract.js),
   so sound-effects and artwork don't pollute the result.
3. **Look up** — the words from that selection appear in the sidebar; click one to
   see its definition. Inflected forms resolve to their dictionary headword.

Navigate with the arrow keys, the pager, or the page slider.

## Architecture

```
ui/       Vite + React frontend — archive reader, drag-select OCR, lookup sidebar.
          Unpacks zip/cbz/cbr with libarchive.js (worker + wasm copied into
          public/libarchive on postinstall).
server/   Fastify API — GET /api/lookup, backed by Postgres (Neon). Also serves
          ui/dist, and has CORS enabled so the frontend can run on a separate host.
```

The dictionary data comes from
[doozan/spanish_data](https://github.com/doozan/spanish_data) (Wiktionary + Tatoeba):
`es-en.data` (glosses), `es_allforms.csv` (inflected form → lemma — this is what
resolves conjugations), and `frequency.csv` (ranking).

## Prerequisites

- Node 20+
- A Postgres database. The [Neon](https://neon.tech) free tier is plenty (the
  dictionary is well under 1 GB). Use its **pooled** connection string — it ends in
  `?sslmode=require`, which turns on SSL automatically.

## Local development

1. **Install** (both packages):
   ```bash
   cd ui && npm install
   cd ../server && npm install
   ```
2. **Configure the server** — copy `server/.env.example` to `server/.env` and set
   `DATABASE_URL`. The dev and start scripts load `server/.env` automatically.
3. **Load the dictionary** (one-time; downloads ~70 MB of source data to
   `server/.cache`, then bulk-loads ~2.7M form rows — a couple of minutes). The loader
   reads `DATABASE_URL` from the environment:
   ```bash
   cd server
   DATABASE_URL="postgres://…" npm run build:dict
   # PowerShell:  $env:DATABASE_URL="postgres://…"; npm run build:dict
   ```
4. **Run both** (two terminals):
   ```bash
   cd server && npm run dev     # Fastify on :8080
   cd ui && npm run dev         # Vite on :5173, proxies /api → :8080
   ```
   Open the Vite URL, open an archive, drag a box over text, click a word.

## Environment variables

| Where    | Variable        | Purpose                                                         |
| -------- | --------------- | --------------------------------------------------------------- |
| server   | `DATABASE_URL`  | Postgres/Neon connection string (required).                     |
| server   | `PORT`          | Listen port (default 8080; the host usually sets this).         |
| ui build | `VITE_API_URL`  | API base URL when the frontend is hosted separately from the API. Leave unset for same-origin. |

`DATABASE_URL` is only ever read server-side — it is never exposed to the browser.

## Deploy

Load the dictionary once against your Neon database from your machine (step 3 above);
no host needs to run the heavy import. Then pick one:

**Single service** (e.g. Railway) — the API server also serves the frontend:
```
Build:  cd ui && npm ci && npm run build && cd ../server && npm ci
Start:  cd server && npm start
```
Set `DATABASE_URL`. The server serves `ui/dist` and `/api` on `$PORT`.

**Split** — frontend on a static host (e.g. Vercel), API on its own host:
- Build the frontend with `VITE_API_URL` pointing at the API's public URL.
- Deploy `server/` anywhere with `DATABASE_URL` set. CORS is already open.

## Verifying without a UI

```bash
curl "localhost:8080/api/lookup?word=corriste"   # → correr: to run, to jog
```
`server/src/scripts/check-parse.ts` validates the dictionary parsers against the raw
data files, no database required.
