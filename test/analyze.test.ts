import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, mapLimit, pickDense, pickKey } from "../src/ai/analyze.ts";

const long = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

test("pickDense needs high density and enough words", () => {
  const paragraphs = [
    { id: "a", text: long(50) },
    { id: "b", text: long(10) },
    { id: "c", text: long(50) },
    { id: "d", text: long(50) },
  ];
  const triage = [
    { id: "a", density: 0.9, key: null },
    { id: "b", density: 0.9, key: null }, // too short
    { id: "c", density: 0.3, key: null }, // easy
    { id: "d", density: null, key: null }, // unrated
  ];
  assert.deepEqual(pickDense(triage, paragraphs), ["a"]);
});

test("pickKey uses the noul probability", () => {
  assert.deepEqual(pickKey([{ id: "a", density: 0, key: 0.7 }, { id: "b", density: 0, key: 0.2 }, { id: "c", density: 0, key: null }]), ["a"]);
});

test("mapLimit keeps order and caps concurrency", async () => {
  let active = 0;
  let peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    return n * 10;
  });
  assert.deepEqual(out, [10, 20, 30, 40, 50, 60]);
  assert.equal(peak, 2);
});

test("analyze sends only dense ids to the summarizer", async () => {
  const paragraphs = [{ id: "a", text: long(60) }, { id: "b", text: long(60) }];
  let sent: string[] = [];
  const result = await analyze(paragraphs, {
    triage: async (p) => ({ id: p.id, density: p.id === "a" ? 0.8 : 0.2, key: p.id === "b" ? 0.9 : 0.1 }),
    summarize: async (ids) => {
      sent = ids;
      return { tldr: ["t"], chunks: [{ id: "a", bullets: ["x"] }] };
    },
  });
  assert.deepEqual(sent, ["a"]);
  assert.deepEqual(result.denseIds, ["a"]);
  assert.deepEqual(result.keyIds, ["b"]);
  assert.deepEqual(result.tldr, ["t"]);
});

test("analyze tolerates some Jev failures", async () => {
  const paragraphs = [{ id: "a", text: long(60) }, { id: "b", text: long(60) }];
  const result = await analyze(paragraphs, {
    triage: async (p) => {
      if (p.id === "a") throw new Error("boom");
      return { id: p.id, density: 0.9, key: 0.9 };
    },
    summarize: async () => ({ tldr: [], chunks: [] }),
  });
  assert.deepEqual(result.denseIds, ["b"]);
});

test("analyze throws when every Jev call fails", async () => {
  await assert.rejects(
    analyze([{ id: "a", text: "x" }], {
      triage: async () => { throw new Error("Jev rejected the API key."); },
      summarize: async () => ({ tldr: [], chunks: [] }),
    }),
    /rejected/,
  );
});
