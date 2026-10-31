// Orchestration: Jev triages every paragraph, then Haiku chunks only the dense ones.

import type { Analysis, Paragraph, Triage } from "./types.ts";

export const DENSE_THRESHOLD = 0.6; // density 0..1
export const KEY_THRESHOLD = 0.6; // noul probability
export const MIN_DENSE_WORDS = 35; // short paragraphs are never worth chunking
export const JEV_CONCURRENCY = 4;

export type Deps = {
  triage: (p: Paragraph) => Promise<Triage>;
  summarize: (denseIds: string[]) => Promise<{ tldr: string[]; chunks: Analysis["chunks"] }>;
};

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function pickDense(triage: Triage[], paragraphs: Paragraph[]): string[] {
  const words = new Map(paragraphs.map((p) => [p.id, wordCount(p.text)]));
  return triage
    .filter((t) => t.density !== null && t.density >= DENSE_THRESHOLD && (words.get(t.id) ?? 0) >= MIN_DENSE_WORDS)
    .map((t) => t.id);
}

export function pickKey(triage: Triage[]): string[] {
  return triage.filter((t) => t.key !== null && t.key >= KEY_THRESHOLD).map((t) => t.id);
}

/** Run `fn` over `items` with at most `limit` in flight. Keeps input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function analyze(paragraphs: Paragraph[], deps: Deps): Promise<Analysis> {
  let firstError: unknown;
  const triage = await mapLimit(paragraphs, JEV_CONCURRENCY, async (p) => {
    try {
      return await deps.triage(p);
    } catch (err) {
      firstError ??= err;
      return { id: p.id, density: null, key: null };
    }
  });
  // If Jev failed on every paragraph (bad key, network), surface that instead of an empty result.
  if (paragraphs.length && triage.every((t) => t.density === null && t.key === null) && firstError) {
    throw firstError;
  }
  const denseIds = pickDense(triage, paragraphs);
  const keyIds = pickKey(triage);
  const { tldr, chunks } = await deps.summarize(denseIds);
  return { triage, denseIds, keyIds, tldr, chunks };
}
