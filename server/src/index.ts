import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { lookup } from "./dictionary.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: true });

// --- API ------------------------------------------------------------------
app.get<{ Querystring: { word?: string } }>("/api/lookup", async (req, reply) => {
  const word = req.query.word?.trim();
  if (!word) {
    return reply.code(400).send({ error: "Missing ?word=" });
  }
  try {
    return await lookup(word);
  } catch (err) {
    req.log.error(err);
    return reply.code(500).send({ error: "Lookup failed" });
  }
});

app.get("/api/health", async () => ({ ok: true }));

// --- Static frontend (production single-service deploy) --------------------
// In dev the frontend runs under Vite and proxies /api here, so serving the
// build is optional and only wired up when ui/dist exists.
const uiDist = join(__dirname, "..", "..", "ui", "dist");
if (existsSync(uiDist)) {
  await app.register(fastifyStatic, { root: uiDist });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api")) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.sendFile("index.html"); // SPA fallback
  });
}

const port = Number(process.env.PORT) || 8080;
app
  .listen({ port, host: "0.0.0.0" })
  .then(() => app.log.info(`server listening on ${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
