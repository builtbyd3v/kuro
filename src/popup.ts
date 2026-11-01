// Popup: writes settings to chrome.storage. The content script reacts to the changes.

import { loadKeys, loadSettings, toggleSite, type Settings } from "./settings.ts";
import type { Strength } from "./bold.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function hostOf(url: string | undefined): string | null {
  try {
    const u = new URL(url ?? "");
    return u.protocol === "http:" || u.protocol === "https:" ? u.hostname : null;
  } catch {
    return null;
  }
}

function setStatus(text: string, isError = false): void {
  const el = $("status");
  el.textContent = text;
  el.classList.toggle("error", isError);
}

async function init(): Promise<void> {
  const [settings, keys, tab] = await Promise.all([loadSettings(), loadKeys(), activeTab()]);
  const host = hostOf(tab?.url);
  let current: Settings = settings;
  const save = (patch: Partial<Settings>) => {
    current = { ...current, ...patch };
    return chrome.storage.sync.set(patch);
  };

  // Site toggle
  const site = $<HTMLInputElement>("site");
  $("host").textContent = host ?? "";
  if (host) {
    site.checked = current.sites[host] === true;
    site.addEventListener("change", () => save({ sites: toggleSite(current.sites, host) }));
  } else {
    site.disabled = true;
    $("site-note").hidden = false;
  }

  // Focus reader toggle, separate from bolding
  const focus = $<HTMLInputElement>("focus");
  if (host) {
    focus.checked = current.focusSites[host] === true;
    focus.addEventListener("change", () => save({ focusSites: toggleSite(current.focusSites, host) }));
  } else {
    focus.disabled = true;
  }

  // Show the shortcuts Chrome actually assigned (Control+Shift+B/F on a Mac, Alt+Shift+K/F elsewhere).
  chrome.commands.getAll((cmds) => {
    let missing = false;
    for (const [name, id] of [["toggle-site", "shortcut-site"], ["toggle-focus", "shortcut-focus"]]) {
      const key = cmds.find((c) => c.name === name)?.shortcut ?? "";
      $(id).textContent = key || "none";
      missing ||= !key;
    }
    $("shortcut-note").hidden = !missing;
  });

  // Strength
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="strength"]')) {
    radio.checked = radio.value === current.strength;
    radio.addEventListener("change", () => radio.checked && save({ strength: radio.value as Strength }));
  }

  // Skim
  const skim = $<HTMLInputElement>("skim");
  skim.checked = current.skim;
  skim.addEventListener("change", () => save({ skim: skim.checked }));

  // AI opt-in and keys
  const ai = $<HTMLInputElement>("ai");
  const panel = $("ai-panel");
  ai.checked = current.aiEnabled;
  panel.hidden = !ai.checked;
  ai.addEventListener("change", () => {
    panel.hidden = !ai.checked;
    save({ aiEnabled: ai.checked });
  });

  const jev = $<HTMLInputElement>("jev-key");
  const anthropic = $<HTMLInputElement>("anthropic-key");
  jev.value = keys.jevKey;
  anthropic.value = keys.anthropicKey;
  $("save-keys").addEventListener("click", async () => {
    await chrome.storage.local.set({ jevKey: jev.value.trim(), anthropicKey: anthropic.value.trim() });
    setStatus("Keys saved on this device.");
  });

  const analyze = $<HTMLButtonElement>("analyze");
  analyze.disabled = !host;
  analyze.addEventListener("click", async () => {
    if (!tab?.id) return;
    // Save whatever is typed so the first run works without a separate Save click.
    await chrome.storage.local.set({ jevKey: jev.value.trim(), anthropicKey: anthropic.value.trim() });
    analyze.disabled = true;
    setStatus("Reading the page and asking Jev and Claude. This can take 10 to 30 seconds.");
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: "br-run-analysis" });
      if (res?.ok) {
        const c = res.counts;
        setStatus(`Done. ${c.paragraphs} paragraphs checked, ${c.dense} turned into bullets, ${c.key} marked as key.`);
      } else {
        setStatus(res?.error ?? "Something went wrong.", true);
      }
    } catch {
      setStatus("Kuro isn't running on this tab yet. Reload the page and try again.", true);
    } finally {
      analyze.disabled = false;
    }
  });
}

init();
