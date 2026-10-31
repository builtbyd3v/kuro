import { test } from "node:test";
import assert from "node:assert/strict";
import { buildJevRequest, JEV_URL, parseJevResponse, triageParagraph, JevError } from "../src/ai/jev.ts";

const p = { id: "p3", text: "Some paragraph." };

test("buildJevRequest asks two atomic questions about one paragraph", () => {
  const req = buildJevRequest("Title", p);
  assert.deepEqual(req.state, { article_title: "Title", paragraph: "Some paragraph." });
  assert.equal(req.questions.density.type, "score");
  assert.equal(req.questions.density.criteria.length, 3);
  assert.equal(req.questions.key.type, "noul");
  assert.equal("criteria" in req.questions.key, false);
});

test("parseJevResponse normalizes score to 0..1", () => {
  const body = { answers: { density: { type: "score", score: 1.5 }, key: { type: "noul", noul: 0.8 } } };
  assert.deepEqual(parseJevResponse("p3", body), { id: "p3", density: 0.75, key: 0.8 });
});

test("parseJevResponse returns nulls for missing or bad answers", () => {
  assert.deepEqual(parseJevResponse("x", {}), { id: "x", density: null, key: null });
  assert.deepEqual(parseJevResponse("x", null), { id: "x", density: null, key: null });
  assert.deepEqual(parseJevResponse("x", { answers: { density: { score: "2" }, key: { noul: NaN } } }), {
    id: "x", density: null, key: null,
  });
});

test("triageParagraph posts to Jev with a bearer key", async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    seen = { url, init };
    return new Response(JSON.stringify({ answers: { density: { score: 2 }, key: { noul: 0.1 } } }), { status: 200 });
  }) as unknown as typeof fetch;
  const t = await triageParagraph("k-123", "T", p, fakeFetch);
  assert.equal(seen!.url, JEV_URL);
  assert.equal((seen!.init.headers as Record<string, string>).Authorization, "Bearer k-123");
  assert.deepEqual(t, { id: "p3", density: 1, key: 0.1 });
});

test("triageParagraph reports a rejected key clearly", async () => {
  const fakeFetch = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
  await assert.rejects(triageParagraph("bad", "T", p, fakeFetch), (e: unknown) => e instanceof JevError && e.status === 401);
});
