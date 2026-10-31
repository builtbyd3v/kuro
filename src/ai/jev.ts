// Jev (TypeSafe System One) triage: is a paragraph dense, and is it key to the argument?
// API: POST https://api.typesafe.ai/v1/systemone (docs.typesafe.ai, read 2026-10-31).

import type { Paragraph, Triage } from "./types.ts";

export const JEV_URL = "https://api.typesafe.ai/v1/systemone";
export const JEV_MODEL = "jev-latest";

export const DENSITY_LEVELS = [
  "Easy: short sentences, plain words, one simple idea",
  "Moderate: a few ideas or some technical words, but readable in one pass",
  "Dense: many ideas packed together, long sentences, or heavy jargon; most readers would need to reread it",
] as const;

export function buildJevRequest(title: string, p: Paragraph) {
  // Each question is atomic and runs in isolation; results are combined in code.
  return {
    model: JEV_MODEL,
    state: { article_title: title, paragraph: p.text },
    questions: {
      density: {
        type: "score",
        instructions: "How dense and hard to read is this paragraph?",
        criteria: [...DENSITY_LEVELS],
      },
      key: {
        type: "noul",
        instructions: "This paragraph states or directly supports the main point of the article, rather than being background, an aside, or filler.",
      },
    },
  };
}

type JevAnswer = { type?: string; score?: unknown; noul?: unknown };

/** Turn a Jev response into a Triage. Bad or missing answers become null, not errors. */
export function parseJevResponse(id: string, body: unknown): Triage {
  const answers = (body as { answers?: Record<string, JevAnswer> } | null)?.answers ?? {};
  const score = answers.density?.score;
  const noul = answers.key?.noul;
  const maxLevel = DENSITY_LEVELS.length - 1;
  return {
    id,
    density: typeof score === "number" && Number.isFinite(score) ? clamp01(score / maxLevel) : null,
    key: typeof noul === "number" && Number.isFinite(noul) ? clamp01(noul) : null,
  };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export class JevError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

/** Call Jev for one paragraph. `fetchFn` is injectable for tests. */
export async function triageParagraph(
  apiKey: string,
  title: string,
  p: Paragraph,
  fetchFn: typeof fetch = fetch,
): Promise<Triage> {
  const res = await fetchFn(JEV_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildJevRequest(title, p)),
  });
  if (res.status === 401 || res.status === 403) throw new JevError("Jev rejected the API key.", res.status);
  if (!res.ok) throw new JevError(`Jev returned HTTP ${res.status}.`, res.status);
  return parseJevResponse(p.id, await res.json());
}
