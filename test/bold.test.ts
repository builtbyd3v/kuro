import { test } from "node:test";
import assert from "node:assert/strict";
import { boldLength, splitText, splitWord, STRENGTHS } from "../src/bold.ts";

test("strength fractions match the spec", () => {
  assert.deepEqual(STRENGTHS, { light: 0.3, medium: 0.45, strong: 0.6 });
});

test("boldLength rounds up and bolds at least one letter", () => {
  assert.equal(boldLength("a", "light"), 1);
  assert.equal(boldLength("an", "light"), 1); // 0.6 -> 1
  assert.equal(boldLength("reading", "light"), 3); // 2.1 -> 3
  assert.equal(boldLength("reading", "medium"), 4); // 3.15 -> 4
  assert.equal(boldLength("reading", "strong"), 5); // 4.2 -> 5
  assert.equal(boldLength("attention", "medium"), 5); // 4.05 -> 5
});

test("boldLength counts letters, not apostrophes or hyphens", () => {
  // "don't" has 4 letters -> medium 1.8 -> 2
  assert.equal(boldLength("don't", "medium"), 2);
  // "well-known" has 9 letters -> light 2.7 -> 3
  assert.equal(boldLength("well-known", "light"), 3);
});

test("boldLength counts accented letters as one", () => {
  assert.equal(boldLength("café", "medium"), 2); // 4 letters
  assert.equal(boldLength("café", "medium"), 2); // e + combining accent is still 4 letters
});

test("splitWord keeps combining marks with their letter", () => {
  assert.deepEqual(splitWord("café", "strong"), ["caf", "é"]); // 2.4 -> 3
  assert.deepEqual(splitWord("don't", "medium"), ["do", "n't"]);
  assert.deepEqual(splitWord("Über", "light"), ["Üb", "er"]);
});

test("splitText separates words from spaces and punctuation", () => {
  assert.deepEqual(splitText("Hello, world!"), [
    { text: "Hello", word: true },
    { text: ", ", word: false },
    { text: "world", word: true },
    { text: "!", word: false },
  ]);
});

test("splitText keeps apostrophes and hyphens inside words", () => {
  assert.deepEqual(
    splitText("It's a well-known fact"),
    [
      { text: "It's", word: true },
      { text: " ", word: false },
      { text: "a", word: true },
      { text: " ", word: false },
      { text: "well-known", word: true },
      { text: " ", word: false },
      { text: "fact", word: true },
    ],
  );
  assert.deepEqual(splitText("it’s")[0], { text: "it’s", word: true });
});

test("splitText leaves trailing or doubled hyphens outside words", () => {
  assert.deepEqual(splitText("pre- and post--war").map((p) => p.text), [
    "pre", "- ", "and", " ", "post", "--", "war",
  ]);
});

test("splitText does not bold pure numbers", () => {
  const parts = splitText("In 2026 we had 3.5 cats and COVID19");
  const words = parts.filter((p) => p.word).map((p) => p.text);
  assert.deepEqual(words, ["In", "we", "had", "cats", "and", "COVID19"]);
});

test("splitText handles Cyrillic and Greek", () => {
  assert.deepEqual(splitText("Привет мир").filter((p) => p.word).map((p) => p.text), ["Привет", "мир"]);
  assert.deepEqual(splitText("γειά σου").filter((p) => p.word).map((p) => p.text), ["γειά", "σου"]);
});

test("splitText skips scripts written without spaces (CJK, Thai)", () => {
  assert.equal(splitText("日本語の文章です").some((p) => p.word), false);
  assert.equal(splitText("ภาษาไทย").some((p) => p.word), false);
  assert.equal(splitText("한국어 문장").some((p) => p.word), true); // Korean uses spaces
});

test("splitText treats emoji as non-word text", () => {
  assert.deepEqual(splitText("go 🚀 now"), [
    { text: "go", word: true },
    { text: " 🚀 ", word: false },
    { text: "now", word: true },
  ]);
});

test("splitText round-trips the original text", () => {
  const samples = ["", "   ", "Hello, world!", "It's 3 o'clock — café time 🚀", "日本語 and English", "a-b-c--d'"];
  for (const s of samples) {
    assert.equal(splitText(s).map((p) => p.text).join(""), s);
  }
});

test("splitText returns no parts for empty text", () => {
  assert.deepEqual(splitText(""), []);
});

