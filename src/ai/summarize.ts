// Haiku turns only the dense paragraphs into short bullets, plus a TL;DR of the article.

import Anthropic from "@anthropic-ai/sdk";
import type { Chunk, Paragraph } from "./types.ts";

export const HAIKU_MODEL = "claude-haiku-5-5";
/** Cap on article text sent for the TL;DR, in characters (~15K tokens). */
export const MAX_ARTICLE_CHARS = 60_000;

export const SYSTEM_PROMPT = `You help readers with ADHD get through long articles.
You get an article split into numbered paragraphs, and a list of paragraph ids that are dense.
1. tldr: 1 to 3 short sentences that give the article's main point. Plain words.
2. chunks: for each dense paragraph id, rewrite that paragraph as 2 to 5 short bullets. Keep every fact, number, and name. Do not add anything that is not in the paragraph. Each bullet is one idea, under 20 words.
Write in the article's language.`;

export const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    tldr: { type: "array", items: { type: "string" } },
    chunks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
        },
        required: ["id", "bullets"],
        additionalProperties: false,
      },
    },
  },
  required: ["tldr", "chunks"],
  additionalProperties: false,
} as const;

/** Build the user message: every paragraph with its id, then the dense ids. */
export function buildUserMessage(title: string, paragraphs: Paragraph[], denseIds: string[]): string {
  let budget = MAX_ARTICLE_CHARS;
  const dense = new Set(denseIds);
  const lines: string[] = [];
  for (const p of paragraphs) {
    // Dense paragraphs are always included in full; others only while budget lasts.
    if (!dense.has(p.id) && p.text.length > budget) continue;
    budget -= p.text.length;
    lines.push(`<p id="${p.id}">${p.text}</p>`);
  }
  return `<title>${title}</title>\n<article>\n${lines.join("\n")}\n</article>\n<dense_ids>${denseIds.join(", ")}</dense_ids>`;
}

/** Validate the model's JSON. Drops chunks for unknown ids and empty bullets. */
export function parseSummary(text: string, denseIds: string[]): { tldr: string[]; chunks: Chunk[] } {
  const data = JSON.parse(text) as { tldr?: unknown; chunks?: unknown };
  const strings = (v: unknown) =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim() !== "").map((s) => s.trim()) : [];
  const allowed = new Set(denseIds);
  const chunks: Chunk[] = [];
  if (Array.isArray(data.chunks)) {
    for (const c of data.chunks as { id?: unknown; bullets?: unknown }[]) {
      if (typeof c?.id !== "string" || !allowed.has(c.id)) continue;
      const bullets = strings(c.bullets);
      if (bullets.length) chunks.push({ id: c.id, bullets });
    }
  }
  return { tldr: strings(data.tldr).slice(0, 3), chunks };
}

export function makeClient(apiKey: string): Anthropic {
  // The key is the user's own and never leaves their browser except to api.anthropic.com.
  // This option sends the `anthropic-dangerous-direct-browser-access` header the API needs
  // for requests that carry a browser Origin (an extension service worker does).
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

export async function summarize(
  client: Anthropic,
  title: string,
  paragraphs: Paragraph[],
  denseIds: string[],
): Promise<{ tldr: string[]; chunks: Chunk[] }> {
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 16000,
    output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(title, paragraphs, denseIds) }],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined to summarize this page.");
  if (response.stop_reason === "max_tokens") throw new Error("The summary was cut off. Try a shorter page.");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Claude returned no summary.");
  return parseSummary(text.text, denseIds);
}

/** Turn SDK errors into short messages for the popup. */
export function describeAnthropicError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Anthropic rejected the API key.";
  if (err instanceof Anthropic.PermissionDeniedError) return "This Anthropic key can't use Haiku.";
  if (err instanceof Anthropic.RateLimitError) return "Anthropic rate limit hit. Try again in a minute.";
  if (err instanceof Anthropic.BadRequestError) return `Anthropic rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach Anthropic. Check your connection.";
  if (err instanceof Anthropic.APIError) return `Anthropic error ${err.status ?? ""}: ${err.message}`.trim();
  return err instanceof Error ? err.message : String(err);
}
