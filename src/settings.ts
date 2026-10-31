import type { Strength } from "./bold.ts";

/** Synced settings (chrome.storage.sync). No secrets here. */
export type Settings = {
  sites: Record<string, boolean>; // bold word starts, per site. key: location.hostname
  focusSites: Record<string, boolean>; // focus reader (paragraph spotlight), per site, separate from bolding
  strength: Strength;
  skim: boolean; // highlight key paragraphs after an AI pass, dim the rest
  aiEnabled: boolean; // AI is opt-in and off by default
};

/** API keys stay on this device only (chrome.storage.local). */
export type Keys = { jevKey: string; anthropicKey: string };

export const DEFAULT_SETTINGS: Settings = {
  sites: {},
  focusSites: {},
  strength: "medium",
  skim: false,
  aiEnabled: false,
};

const STRENGTH_VALUES: readonly Strength[] = ["light", "medium", "strong"];

/** Fill in defaults and drop bad values from whatever storage returned. */
export function normalizeSettings(raw: Partial<Record<keyof Settings, unknown>> | undefined): Settings {
  const r = raw ?? {};
  return {
    sites: boolMap(r.sites),
    focusSites: boolMap(r.focusSites),
    strength: STRENGTH_VALUES.includes(r.strength as Strength) ? (r.strength as Strength) : DEFAULT_SETTINGS.strength,
    skim: typeof r.skim === "boolean" ? r.skim : DEFAULT_SETTINGS.skim,
    aiEnabled: typeof r.aiEnabled === "boolean" ? r.aiEnabled : DEFAULT_SETTINGS.aiEnabled,
  };
}

function boolMap(v: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (v && typeof v === "object") {
    for (const [host, on] of Object.entries(v as Record<string, unknown>)) {
      if (typeof on === "boolean") out[host] = on;
    }
  }
  return out;
}

/** Return a new sites map with `host` flipped. */
export function toggleSite(sites: Record<string, boolean>, host: string): Record<string, boolean> {
  return { ...sites, [host]: !sites[host] };
}

export async function loadSettings(): Promise<Settings> {
  return normalizeSettings(await chrome.storage.sync.get(null));
}

export async function loadKeys(): Promise<Keys> {
  const r = await chrome.storage.local.get(["jevKey", "anthropicKey"]);
  return {
    jevKey: typeof r.jevKey === "string" ? r.jevKey : "",
    anthropicKey: typeof r.anthropicKey === "string" ? r.anthropicKey : "",
  };
}
