# spanish-manga-reader

Read Spanish manga in the browser: open a **`.zip` / `.cbz` / `.cbr`** archive, page
through it, **drag a box** over a speech bubble to OCR just that region (tesseract.js),
then **click any word** in the sidebar for its English definition from a self-hosted
Spanish→English dictionary (with conjugation support — `corriste` → *correr* → "to run").

## Architecture

```
ui/      Vite + React frontend — archive reader, drag-select OCR, word lookup sidebar
         (unpacks zip/cbz/cbr with libarchive.js; its worker+wasm are copied into
          public/libarchive on postinstall)
server/  Fastify API — /api/lookup backed by Postgres (Neon); also serves ui/dist
```

One deployable service: the Fastify server serves the built frontend **and** the
dictionary API, talking to a Postgres database (Neon) via `DATABASE_URL`.

The dictionary data comes from [doozan/spanish_data](https://github.com/doozan/spanish_data)
(Wiktionary + Tatoeba): `es-en.data` (glosses), `es_allforms.csv` (inflected form →
lemma — this is what resolves conjugations), and `frequency.csv` (ranking).

## Prerequisites

- Node 20+
- A Postgres database. [Neon](https://neon.tech) free tier is plenty (the dictionary
  is well under 1 GB). Copy its **pooled** connection string (it ends in
  `?sslmode=require`).

## Local development

1. **Install**
   ```bash
   cd ui && npm install
   cd ../server && npm install
   ```
2. **Point the server at your database** — `cp server/.env.example server/.env` and set
   `DATABASE_URL` (your Neon string, or a local Postgres).
3. **Load the dictionary** (one-time; downloads ~70 MB of source data to
   `server/.cache`, then bulk-loads ~2.7M form rows — takes a couple of minutes):
   ```bash
   cd server
   # PowerShell:  $env:DATABASE_URL="postgres://…"; npm run build:dict
   DATABASE_URL="postgres://…" npm run build:dict
   ```
4. **Run both** (two terminals):
   ```bash
   cd server && npm run dev     # Fastify on :8080
   cd ui && npm run dev         # Vite on :5173, proxies /api → :8080
   ```
   Open the Vite URL, upload a page, drag a box over text, click a word.

## Deploy on Railway (single service)

1. Create a **Neon** database and run the loader once against it (step 3 above) from
   your machine — Railway doesn't need to do the heavy import.
2. New Railway service from this repo. Build & start (run from `server/`, after the
   frontend is built):
   ```
   Build:  cd ui && npm ci && npm run build && cd ../server && npm ci
   Start:  cd server && npm start
   ```
   The server serves `ui/dist` and `/api` on `$PORT` (Railway sets it automatically).
3. Set the Railway env var **`DATABASE_URL`** to your Neon connection string.

The `DATABASE_URL` is read only server-side — it is never exposed to the browser.

## Verifying the dictionary without a UI

```bash
curl "localhost:8080/api/lookup?word=corriste"   # → correr: to run, to jog
```
`server/src/scripts/check-parse.ts` validates the parsers against the raw data files
(no database required).
