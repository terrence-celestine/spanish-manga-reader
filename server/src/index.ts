import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lookup } from "./dictionary.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: true });

// --- API ------------------------------------------------------------------
app.get<{ Querystring: { word?: string } }>(
  "/api/lookup",
  async (req, reply) => {
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
  },
);

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
const HOST = process.env.HOST || "0.0.0.0"; // MUST be '0.0.0.0' in containerized environments

app
  .listen({ port, host: HOST })
  .then(() => app.log.info(`server listening on ${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
