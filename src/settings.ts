import type { Strength } from "./bold.ts";

/** Synced settings (chrome.storage.sync). No secrets here. */
export type Settings = {
  sites: Record<string, boolean>; // key: location.hostname
  strength: Strength;
  spotlight: boolean;
  skim: boolean; // highlight key paragraphs after an AI pass, dim the rest
  aiEnabled: boolean; // AI is opt-in and off by default
};

/** API keys stay on this device only (chrome.storage.local). */
export type Keys = { jevKey: string; anthropicKey: string };

export const DEFAULT_SETTINGS: Settings = {
  sites: {},
  strength: "medium",
  spotlight: false,
  skim: false,
  aiEnabled: false,
};

const STRENGTH_VALUES: readonly Strength[] = ["light", "medium", "strong"];

/** Fill in defaults and drop bad values from whatever storage returned. */
export function normalizeSettings(raw: Partial<Record<keyof Settings, unknown>> | undefined): Settings {
  const r = raw ?? {};
  const sites: Record<string, boolean> = {};
  if (r.sites && typeof r.sites === "object") {
    for (const [host, on] of Object.entries(r.sites as Record<string, unknown>)) {
      if (typeof on === "boolean") sites[host] = on;
    }
  }
  return {
    sites,
    strength: STRENGTH_VALUES.includes(r.strength as Strength) ? (r.strength as Strength) : DEFAULT_SETTINGS.strength,
    spotlight: typeof r.spotlight === "boolean" ? r.spotlight : DEFAULT_SETTINGS.spotlight,
    skim: typeof r.skim === "boolean" ? r.skim : DEFAULT_SETTINGS.skim,
    aiEnabled: typeof r.aiEnabled === "boolean" ? r.aiEnabled : DEFAULT_SETTINGS.aiEnabled,
  };
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
