# BoldRead

A Chrome extension that makes long web pages easier to read, built with ADHD readers in mind.

- **Bold word starts.** The first part of each word is bolded so your eyes have anchors. Three strengths: light, medium, strong.
- **Per-site, remembered.** Turn it on only where you read. Bolding and the focus reader are separate switches, and every site starts with both off. On a Mac, <kbd>Control</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> toggles bolding and <kbd>Control</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> toggles the focus reader (use <kbd>Alt</kbd> instead of <kbd>Control</kbd> on Windows and Linux).
- **Focus reader.** Enlarges the paragraph under your cursor and dims the rest. Click outside the text to see the whole page again. It has its own switch, so you can use bolding without it.
- **AI summaries (optional, your own keys).** Finds the dense paragraphs and turns them into short bullets, adds a TL;DR at the top, and a skim mode that highlights the paragraphs that carry the argument.

It leaves code blocks, form fields and editable areas alone, so Gmail drafts, Google Docs and code editors keep working. Turning it off restores the page exactly.

## Install

There is no Web Store listing. Load it from source:

1. Install [Node.js](https://nodejs.org) 22.18 or newer.
2. Clone this repo, then in the folder run:
   ```sh
   npm install
   npm run build
   ```
   If npm says esbuild's install script is blocked, run `npm install-scripts approve esbuild` and build again.
3. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the `dist` folder.
4. Pin BoldRead from the puzzle-piece menu, open any article, and switch on **Bold word starts on this site**.

## AI summaries

AI is off until you turn it on in the popup. It needs two keys, which you paste into the popup. They are stored only in this browser (`chrome.storage.local`) and are sent only to the service they belong to.

| Step | Service | What it does | Key |
|---|---|---|---|
| 1 | [TypeSafe](https://typesafe.ai) Jev | Rates each paragraph: how dense it is, and whether it is key to the argument. | Jev API key |
| 2 | [Anthropic](https://console.anthropic.com) Claude Haiku 5.5 | Writes a TL;DR and turns only the dense paragraphs into bullets. | Anthropic API key |

Click **Summarize this page** to run it. Dense paragraphs are replaced by bullets, with a **Show original** link. Turn on **Skim mode** to fade everything except the key paragraphs.

**Privacy:** when you click Summarize, the page's paragraph text is sent to TypeSafe and to Anthropic. Nothing is sent at any other time, and nothing goes to the BoldRead author. Don't run it on pages with private information you don't want to share with those services.

**Cost:** you pay each service directly. Haiku 5.5 is $0.10 per million input tokens and $0.50 per million output tokens (Oct 2026), so a typical long article costs well under a cent. Jev's listed price is $0.042 per million input tokens.

## A note on evidence

Research on bolded word starts is thin and mostly anecdotal. Some people find it helps, some don't. The spotlight and the bullet summaries are there because they help with a different problem: losing your place and getting stuck on dense paragraphs. Try each and keep what works for you.

## Develop

```sh
npm run watch      # rebuild dist/ on every change
npm test           # unit tests (node --test)
npm run typecheck  # tsc --noEmit
npm run build      # production build into dist/
```

After a rebuild, click the reload icon on BoldRead in `chrome://extensions`. See [docs/architecture.md](docs/architecture.md) for how the parts fit together.

## License

MIT
