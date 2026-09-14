import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z } from "zod";
import type { ApiErrorBody } from "../src/lib/contracts.js";
import { DatabaseConfigError } from "./db.js";

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export const errors = {
  badRequest: (message: string, code = "BAD_REQUEST") => new AppError(400, code, message),
  unauthorized: (message = "Please sign in to continue.", code = "UNAUTHENTICATED") => new AppError(401, code, message),
  forbidden: (message = "You do not have permission to do that.", code = "FORBIDDEN") =>
    new AppError(403, code, message),
  notFound: (message = "Not found.", code = "NOT_FOUND") => new AppError(404, code, message),
  conflict: (message: string, code = "CONFLICT") => new AppError(409, code, message),
  tooManyRequests: (message = "Too many requests. Please slow down.", code = "RATE_LIMITED") =>
    new AppError(429, code, message),
};

export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const flat = z.flattenError(result.error);
    const details: Record<string, string[]> = {};
    for (const [key, messages] of Object.entries(flat.fieldErrors)) {
      if (Array.isArray(messages) && messages.length > 0) details[key] = messages.map(String);
    }
    const first = result.error.issues[0];
    const message = first ? `${first.path.length ? `${first.path.join(".")}: ` : ""}${first.message}` : "Invalid input.";
    throw new AppError(400, "VALIDATION_FAILED", message, details);
  }
  return result.data;
}

const uuidSchema = z.uuid();

export function uuidParam(value: unknown, name = "id"): string {
  const result = uuidSchema.safeParse(value);
  if (!result.success) throw errors.badRequest(`Invalid ${name}.`, "INVALID_ID");
  return result.data;
}

/** Wraps an async route; the resolved value is sent as JSON (undefined → 204). */
export function route(fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res)
      .then((result) => {
        if (res.headersSent) return;
        if (result === undefined) res.status(204).end();
        else res.json(result);
      })
      .catch(next);
  };
}

interface PgErrorLike {
  code?: string;
  message: string;
  constraint?: string;
}

function isPgErrorLike(value: unknown): value is PgErrorLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string" &&
    "code" in value &&
    typeof value.code === "string" &&
    /^[0-9A-Z]{5}$/.test(value.code)
  );
}

/** Drizzle wraps driver errors; walk the cause chain to the Postgres error. */
export function findPgError(err: unknown): PgErrorLike | null {
  let current: unknown = err;
  for (let depth = 0; depth < 6 && current; depth++) {
    if (isPgErrorLike(current)) return current;
    current = typeof current === "object" && current !== null && "cause" in current ? current.cause : null;
  }
  return null;
}

export function translateDatabaseError(err: unknown): AppError | null {
  const pg = findPgError(err);
  if (!pg) return null;
  const text = pg.message;

  if (text.includes("ACTIVE_CHAT_LIMIT")) {
    return new AppError(
      409,
      "ACTIVE_CHAT_LIMIT",
      "One of you already has 3 active chats. An existing chat must close before this one can open.",
    );
  }
  if (text.includes("MAHRAM_REQUIRED")) {
    return new AppError(409, "MAHRAM_REQUIRED", "A mahram must be assigned before this connection can be approved.");
  }
  if (text.includes("MAHRAM_INVALID")) {
    return new AppError(400, "MAHRAM_INVALID", "A party cannot chaperone their own connection.");
  }
  if (pg.code === "23505") {
    if (pg.constraint === "uq_connections_active_pair" || text.includes("uq_connections_active_pair")) {
      return new AppError(409, "CONNECTION_EXISTS", "A connection between you two already exists.");
    }
    if (pg.constraint === "users_email_unique" || text.includes("users_email_unique")) {
      return new AppError(409, "EMAIL_TAKEN", "An account with that email already exists.");
    }
    return new AppError(409, "DUPLICATE", "That record already exists.");
  }
  if (pg.code === "23503") return new AppError(400, "REFERENCE_NOT_FOUND", "A referenced record does not exist.");
  if (pg.code === "23514") return new AppError(400, "CONSTRAINT_VIOLATION", "The data failed validation.");
  if (pg.code === "42P01" || pg.code === "42703" || pg.code === "42704") {
    return new AppError(503, "SCHEMA_OUT_OF_DATE", "The database schema is out of date. Run `npm run db:migrate`.");
  }
  return null;
}

export function errorMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let appError: AppError;
  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof DatabaseConfigError) {
    appError = new AppError(503, "DATABASE_NOT_CONFIGURED", err.message);
  } else if (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    (err.type === "entity.parse.failed" || err.type === "entity.too.large")
  ) {
    appError =
      err.type === "entity.too.large"
        ? new AppError(413, "PAYLOAD_TOO_LARGE", "The request is too large.")
        : new AppError(400, "INVALID_JSON", "The request body is not valid JSON.");
  } else {
    appError = translateDatabaseError(err) ?? new AppError(500, "INTERNAL", "Something went wrong. Please try again.");
  }

  if (appError.status >= 500 && !(err instanceof AppError)) {
    console.error(`[api] ${req.method} ${req.path} failed`, err);
  }

  const body: ApiErrorBody = { error: appError.message, code: appError.code };
  if (appError.details && Object.keys(appError.details).length > 0) body.details = appError.details;
  res.status(appError.status).json(body);
}
