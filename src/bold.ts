// Pure logic for "bold word starts". No DOM access, so it runs under `node --test`.

export type Strength = "light" | "medium" | "strong";

/** Fraction of each word's letters that get bolded. */
export const STRENGTHS: Record<Strength, number> = {
  light: 0.3,
  medium: 0.45,
  strong: 0.6,
};

export type Part = { text: string; word: boolean };

// A word is a run of letters/marks/digits, optionally joined by single
// apostrophes or hyphens ("don't", "well-known").
const WORD = /[\p{L}\p{M}\p{N}]+(?:['’ʼ\-‐][\p{L}\p{M}\p{N}]+)*/gu;
// Scripts written without spaces between words. Bolding "the first 45%" of a
// whole sentence would look broken, so leave them alone.
const NO_SPACE_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const HAS_LETTER = /\p{L}/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function segments(word: string): string[] {
  return Array.from(graphemes.segment(word), (s) => s.segment);
}

function isBoldable(word: string): boolean {
  return HAS_LETTER.test(word) && !NO_SPACE_SCRIPT.test(word);
}

/** How many letters (graphemes, ignoring ' and -) at the start of `word` to bold. */
export function boldLength(word: string, strength: Strength): number {
  const letters = segments(word).filter((g) => LETTER_OR_DIGIT.test(g)).length;
  if (letters === 0) return 0;
  return Math.min(letters, Math.max(1, Math.ceil(letters * STRENGTHS[strength] - 1e-9)));
}

/** Split a word into [bolded head, plain tail]. */
export function splitWord(word: string, strength: Strength): [string, string] {
  let remaining = boldLength(word, strength);
  const segs = segments(word);
  let i = 0;
  for (; i < segs.length && remaining > 0; i++) {
    if (LETTER_OR_DIGIT.test(segs[i]!)) remaining--;
  }
  return [segs.slice(0, i).join(""), segs.slice(i).join("")];
}

/** Split text into word and non-word parts. Joining all parts gives back the input. */
export function splitText(text: string): Part[] {
  const parts: Part[] = [];
  const push = (t: string, word: boolean) => {
    if (!t) return;
    const last = parts[parts.length - 1];
    if (last && !last.word && !word) last.text += t;
    else parts.push({ text: t, word });
  };
  let pos = 0;
  for (const m of text.matchAll(WORD)) {
    push(text.slice(pos, m.index), false);
    push(m[0], isBoldable(m[0]));
    pos = m.index + m[0].length;
  }
  push(text.slice(pos), false);
  return parts;
}
