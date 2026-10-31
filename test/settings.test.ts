import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, normalizeSettings, toggleSite } from "../src/settings.ts";

test("normalizeSettings fills defaults for empty storage", () => {
  assert.deepEqual(normalizeSettings({}), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
});

test("AI is off by default", () => {
  assert.equal(DEFAULT_SETTINGS.aiEnabled, false);
});

test("normalizeSettings drops bad values", () => {
  const s = normalizeSettings({ strength: "huge", focusSites: { "a.com": "yes", "c.com": true }, sites: { "a.com": true, "b.com": "on" } });
  assert.equal(s.strength, "medium");
  assert.deepEqual(s.focusSites, { "c.com": true });
  assert.deepEqual(s.sites, { "a.com": true });
});

test("every site starts with bolding and focus reader off", () => {
  const s = normalizeSettings({});
  assert.deepEqual(s.sites, {});
  assert.deepEqual(s.focusSites, {});
});

test("toggleSite flips one host and leaves the input alone", () => {
  const before = { "a.com": true };
  assert.deepEqual(toggleSite(before, "a.com"), { "a.com": false });
  assert.deepEqual(toggleSite(before, "b.com"), { "a.com": true, "b.com": true });
  assert.deepEqual(before, { "a.com": true });
});
