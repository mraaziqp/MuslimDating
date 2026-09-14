import "dotenv/config";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import app from "./app.js";
import { getDatabase } from "./db.js";

// PORT is only honoured for self-hosted production; in development Vite owns PORT and proxies to API_PORT.
const PORT = Number(process.env.API_PORT ?? (process.env.NODE_ENV === "production" ? process.env.PORT : undefined) ?? 3001);

// Self-hosted production: serve the built SPA from the same process.
const dist = path.resolve("dist");
if (process.env.NODE_ENV === "production" && existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: "1h" }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const handle = await getDatabase();
app.listen(PORT, () => {
  console.log(`[NikahPath API] Listening on http://localhost:${PORT} (database: ${handle.kind})`);
});
