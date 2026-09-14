import type { ReadinessModuleId } from "../src/lib/readiness.js";

/** Correct option index per question. Server-only: never import from src/. */
export const READINESS_ANSWER_KEY: Record<ReadinessModuleId, readonly number[]> = {
  intro: [0, 1, 2, 3, 0],
  wali: [1, 2, 0],
  finance: [2, 1, 3],
};
