// Service worker: the site toggle shortcut, and all AI calls (so keys never touch web pages).

import { loadKeys, loadSettings, toggleSite } from "./settings.ts";
import { analyze } from "./ai/analyze.ts";
import { triageParagraph } from "./ai/jev.ts";
import { describeAnthropicError, makeClient, summarize } from "./ai/summarize.ts";
import type { AnalyzeRequest, AnalyzeResponse } from "./ai/types.ts";

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.hostname : null;
  } catch {
    return null;
  }
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  const host = hostOf(tab?.url);
  if (!host) return;
  const { sites, focusSites } = await loadSettings();
  if (command === "toggle-site") await chrome.storage.sync.set({ sites: toggleSite(sites, host) });
  if (command === "toggle-focus") await chrome.storage.sync.set({ focusSites: toggleSite(focusSites, host) });
});

async function handleAnalyze(req: AnalyzeRequest): Promise<AnalyzeResponse> {
  const [settings, keys] = await Promise.all([loadSettings(), loadKeys()]);
  if (!settings.aiEnabled) return { ok: false, error: "AI is off. Turn it on in the BoldRead popup first." };
  if (!keys.jevKey) return { ok: false, error: "Add your Jev (TypeSafe) API key in the popup." };
  if (!keys.anthropicKey) return { ok: false, error: "Add your Anthropic API key in the popup." };

  const client = makeClient(keys.anthropicKey);
  try {
    const analysis = await analyze(req.paragraphs, {
      triage: (p) => triageParagraph(keys.jevKey, req.title, p),
      summarize: (denseIds) => summarize(client, req.title, req.paragraphs, denseIds),
    });
    return { ok: true, analysis };
  } catch (err) {
    return { ok: false, error: describeAnthropicError(err) };
  }
}

chrome.runtime.onMessage.addListener((msg: { type?: string }, _sender, sendResponse) => {
  if (msg?.type !== "br-analyze") return false;
  handleAnalyze(msg as AnalyzeRequest).then(sendResponse);
  return true; // async response
});
