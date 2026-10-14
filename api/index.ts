import type { IncomingMessage, ServerResponse } from "node:http";
import app from "../server/app.js";

type VercelRequest = IncomingMessage & { body?: unknown; _body?: boolean };

/**
 * Vercel entry point. Vercel buffers the request and exposes a lazily parsed
 * `body`; by then the request stream is drained, so the app must not try to
 * read it again. `_body` tells the JSON middleware in server/app.ts to skip.
 */
export default function handler(req: VercelRequest, res: ServerResponse): void {
  let preParsed: boolean;
  try {
    preParsed = req.body !== undefined;
  } catch {
    // Vercel's body getter throws on malformed JSON. Answer here: nothing downstream could read the body either.
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ error: "The request body is not valid JSON.", code: "INVALID_JSON" }));
    return;
  }
  if (preParsed) req._body = true;
  app(req, res);
}
