import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { buildUserMessage, HAIKU_MODEL, MAX_ARTICLE_CHARS, parseSummary, summarize } from "../src/ai/summarize.ts";

const paras = [
  { id: "p0", text: "Intro." },
  { id: "p1", text: "Dense stuff." },
];

test("buildUserMessage tags paragraphs with ids and lists dense ids", () => {
  const msg = buildUserMessage("My title", paras, ["p1"]);
  assert.match(msg, /<p id="p0">Intro\.<\/p>/);
  assert.match(msg, /<dense_ids>p1<\/dense_ids>/);
});

test("buildUserMessage always keeps dense paragraphs when trimming long pages", () => {
  const big = "x".repeat(MAX_ARTICLE_CHARS);
  const msg = buildUserMessage("T", [{ id: "a", text: big }, { id: "b", text: "filler" }, { id: "c", text: "dense" }], ["c"]);
  assert.match(msg, /id="a"/);
  assert.doesNotMatch(msg, /id="b"/);
  assert.match(msg, /id="c"/);
});

test("parseSummary keeps only chunks for dense ids and trims empties", () => {
  const out = parseSummary(
    JSON.stringify({
      tldr: ["One.", " ", "Two.", "Three.", "Four."],
      chunks: [
        { id: "p1", bullets: ["a", "", "b"] },
        { id: "p9", bullets: ["made up"] },
        { id: "p1x", bullets: [] },
      ],
    }),
    ["p1"],
  );
  assert.deepEqual(out, { tldr: ["One.", "Two.", "Three."], chunks: [{ id: "p1", bullets: ["a", "b"] }] });
});

test("parseSummary throws on non-JSON", () => {
  assert.throws(() => parseSummary("not json", []));
});

function fakeClient(response: Partial<Anthropic.Message>, capture: { req?: Anthropic.MessageCreateParams }) {
  return {
    messages: {
      create: async (req: Anthropic.MessageCreateParams) => {
        capture.req = req;
        return response;
      },
    },
  } as unknown as Anthropic;
}

test("summarize calls Haiku with structured output and low effort", async () => {
  const cap: { req?: Anthropic.MessageCreateParams } = {};
  const client = fakeClient(
    { stop_reason: "end_turn", content: [{ type: "text", text: '{"tldr":["Point."],"chunks":[{"id":"p1","bullets":["b"]}]}', citations: null }] },
    cap,
  );
  const out = await summarize(client, "T", paras, ["p1"]);
  assert.equal(cap.req!.model, HAIKU_MODEL);
  assert.equal(cap.req!.output_config?.effort, "low");
  assert.equal(cap.req!.output_config?.format?.type, "json_schema");
  assert.deepEqual(out, { tldr: ["Point."], chunks: [{ id: "p1", bullets: ["b"] }] });
});

test("summarize surfaces a refusal", async () => {
  const client = fakeClient({ stop_reason: "refusal", content: [] }, {});
  await assert.rejects(summarize(client, "T", paras, []), /declined/);
});
