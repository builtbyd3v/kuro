/** Messages and data shared by the content script, popup and service worker. */

export type Paragraph = { id: string; text: string };

export type Triage = {
  id: string;
  /** 0 (easy) to 1 (dense). null when Jev could not rate it. */
  density: number | null;
  /** Probability 0 to 1 that the paragraph is key to the argument. */
  key: number | null;
};

export type Chunk = { id: string; bullets: string[] };

export type Analysis = {
  triage: Triage[];
  denseIds: string[];
  keyIds: string[];
  tldr: string[];
  chunks: Chunk[];
};

export type AnalyzeRequest = { type: "br-analyze"; title: string; paragraphs: Paragraph[] };
export type AnalyzeResponse = { ok: true; analysis: Analysis } | { ok: false; error: string };
