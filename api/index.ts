import type { IncomingMessage, ServerResponse } from "node:http";
import app from "../server/app.js";

type VercelRequest = IncomingMessage & { body?: unknown; _body?: boolean };

/**
 * Vercel entry point. Vercel buffers and parses the request body before
 * invoking the function; flagging `_body` stops express.json() from waiting
 * on a stream that has already been consumed.
 */
export default function handler(req: VercelRequest, res: ServerResponse): void {
  let preParsed = false;
  try {
    preParsed = req.body !== undefined;
  } catch {
    // Vercel's lazy body getter throws on malformed JSON; let express report it.
  }
  if (preParsed) req._body = true;
  app(req, res);
}
