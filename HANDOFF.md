# HANDOFF: boldread (ADHD reading Chrome extension)

- Goal: open-source Chrome extension on GitHub that makes long web text easier to read for ADHD readers.
- Done: research, platform pick, v1 and v2 scope, tooling. All decisions below are locked. No code yet.
- Next step: scaffold the repo on branch `feat/v1`, then build v1 (Build order below).
- Open decisions: none for v1. v2: confirm Anthropic browser access header and Jev CORS before building.
- Key files (planned): `src/bold.ts`, `src/content.ts`, `src/popup.ts`, `manifest.json`, `content.css`.

---

## Locked decisions

| Area | Decision | Why |
|---|---|---|
| Platform | Chrome extension, Manifest V3 | macOS apps cannot restyle text inside other apps. The extension edits the page DOM directly. |
| Distribution | GitHub repo, users "Load unpacked". No Web Store. | No store fee, no review, no privacy-policy work for v1. |
| AI keys (v2) | Users paste their own keys in the popup. Stored in `chrome.storage.local`. | No proxy server, no cost to the author. |
| Activation | Per site, remembered. Shortcut Alt+Shift+B toggles the current site. | Auto-on everywhere breaks Gmail, Docs, and code editors. |
| Focus aid | Paragraph spotlight: dim every block except the one under the cursor. | Works on most layouts. Reading ruler rejected (jumpy on scroll). |
| Tooling | TypeScript + esbuild (dev deps only). Tests: Node built-in `node --test` (Node 24 strips TS types). | Bundles TS into the plain files Chrome loads. No Vitest needed. |
| Styling | Plain CSS in `content.css` and `popup.css`. | Content CSS must not leak into host pages. Tailwind would add a build dep. Overrule if wanted. |
| Name | "Bold word starts". Never "Bionic Reading" in name or README. | "Bionic Reading" is a registered trademark. |

## v1 scope (no AI, no keys)

Build:
1. Bold word starts with 3 strengths: light 0.3, medium 0.45, strong 0.6 (fraction of each word bolded, round up, min 1 letter).
2. Skip `SCRIPT`, `STYLE`, `NOSCRIPT`, `TEXTAREA`, `INPUT`, `CODE`, `PRE`, `SVG`, and any `contenteditable` subtree.
3. Clean revert: wrap processed text in `span.br-w`. Turning off replaces each span with its plain text.
4. `MutationObserver` for new content, debounced. Disconnect it while the script mutates.
5. Paragraph spotlight toggle. Popup with: site on/off, strength, spotlight on/off.

Not in v1: AI, narrow column mode, PDFs (Chrome's PDF viewer has no DOM).

Settings shape (`chrome.storage.sync`):
```ts
type Settings = {
  sites: Record<string, boolean>; // key: location.hostname
  strength: "light" | "medium" | "strong";
  spotlight: boolean;
};
```

Data flow: popup writes `chrome.storage.sync` -> content script reads on load and listens to `storage.onChanged` -> content script edits the page. Shortcut: `commands` API in a small service worker that flips `sites[hostname]`.

## Build order

1. `git init`, branch `feat/v1`, `npm init`, add `typescript` and `esbuild` as dev deps. Scripts: `build`, `watch`, `typecheck` (`tsc --noEmit`), `test` (`node --test`).
2. Write `docs/architecture.md` with a Mermaid diagram (new project rule).
3. TDD the pure logic in `src/bold.ts`: `boldLength(word, strength)` and `splitText(text)` into word and non-word parts. Cover punctuation, numbers, apostrophes, hyphens, non-Latin text, emoji.
4. Build `src/content.ts`, `content.css`, `src/popup.ts`, `popup.html`, `popup.css`, `src/background.ts`, `manifest.json`.
5. Done-check: `npm test`, `npm run typecheck`, `npm run build`. Then a screenshot of a local test article page in the built-in browser, with `dist/content.js` injected and a stubbed `chrome.storage`. Then "Load unpacked" in real Chrome by hand.

## v2 plan (AI, bring your own keys)

- Content script splits the article into paragraphs. Main content extraction: try `@mozilla/readability` first (local, free).
- Jev (TypeSafe AI) triages each paragraph. Jev returns typed decisions with confidence, not text.
  - Score question: paragraph density, easy to dense.
  - Noul question: "this paragraph is key to the argument" -> skim mode highlights key paragraphs.
- Haiku chunks only the dense paragraphs into short bullets plus a TL;DR. This keeps cost low.
- Calls go from the extension service worker with the user's keys. AI is opt-in and off by default.
- New deps for v2: `typesafe-sdk` (or raw `fetch`), Anthropic SDK (or raw `fetch`). Decide in the v2 card.

Jev API facts (from docs.typesafe.ai, read 2026-10-31):
- `POST https://api.typesafe.ai/v1/systemone`, header `Authorization: Bearer <API_KEY>`.
- Request: a `state` (string or object) plus named `questions`. Types: `choice` (pick from list), `score` (rubric position), `noul` (true probability 0 to 1).
- Questions run in parallel and in isolation. Keep each question atomic; combine results in code.
- Vendor-listed price: $0.042 per million input tokens, output free. Treat as marketing until measured.
- TypeSafe has a Claude Code skill: `claude plugin marketplace add typesafe-ai/skills`, then `claude plugin install typesafe@typesafe-ai`.

Check before v2 (do not guess):
- Anthropic API from an extension: confirm the browser-access header and the current Haiku model id and price (use the `claude-api` skill).
- Jev from an extension: confirm CORS or call from the service worker with `host_permissions`.

## Risks

- Evidence for bold word starts is weak and mostly anecdotal. Sell the focus tools and chunking, not speed claims.
- Free bolding extensions already exist (Jiffy Reader, Bionify). The differentiators are spotlight, skim mode, and chunking.
- Bolding every text node on huge pages can be slow. Process in batches with `requestIdleCallback` if needed.
- v2 sends page text to two outside services. State this in the README and keep AI opt-in.
