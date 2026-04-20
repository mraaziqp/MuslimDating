import "dotenv/config";
import type { Request, Response } from "express";

export default async function handler(req: Request, res: Response) {
	try {
		const mod = await import("../server/app.js");
		const app = mod.default as unknown as (req: Request, res: Response) => void;
		return app(req, res);
	} catch (err) {
		const e = err as { message?: string; stack?: string };
		console.error("[api bootstrap error]", err);
		return res.status(500).json({
			error: "API bootstrap failed",
			message: e?.message ?? "Unknown startup error",
			stack: process.env.NODE_ENV === "development" ? e?.stack : undefined,
		});
	}
}
