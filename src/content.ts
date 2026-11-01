// Content script: bolds word starts, runs the paragraph spotlight, and shows AI results.

import { splitText, splitWord, type Strength } from "./bold.ts";
import { loadSettings, normalizeSettings, type Settings } from "./settings.ts";
import { wordCount } from "./ai/analyze.ts";
import type { Analysis, AnalyzeRequest, AnalyzeResponse, Paragraph } from "./ai/types.ts";

const host = location.hostname;
let settings: Settings;
let bolded = false;
let activeStrength: Strength = "medium";

// ---------- Bold word starts ----------

const SKIP = "script, style, noscript, textarea, input, select, option, code, pre, kbd, samp, svg, math, .br-w, .br-ctl";
const BATCH = 300;

function shouldSkip(parent: Element | null): boolean {
  if (!parent) return true;
  if (parent.closest(SKIP)) return true;
  return (parent as HTMLElement).isContentEditable === true;
}

let toneCache = new WeakMap<Element, string>();

/**
 * Pick the word-ending style from the text color.
 * Light text (a dark page): "br-fade", endings at 72%.
 * Dark text (a light page): "br-ink", endings at 65%, and "br-black" too when the text is a
 * neutral grey or black, so the starts turn pure black. Colored text keeps its own color.
 */
function toneClass(el: Element): string {
  let cls = toneCache.get(el);
  if (cls === undefined) {
    const m = getComputedStyle(el).color.match(/[\d.]+/g);
    const [r, g, b] = (m ?? ["0", "0", "0"]).slice(0, 3).map((v) => Number(v) / 255);
    const light = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
    const neutral = Math.max(r, g, b) - Math.min(r, g, b) < 0.12;
    cls = light ? "br-fade" : neutral ? "br-ink br-black" : "br-ink";
    toneCache.set(el, cls);
  }
  return cls;
}

/** Re-check every bolded run's tone, for sites that switch between light and dark after load. */
function retone(): void {
  toneCache = new WeakMap();
  for (const wrap of document.querySelectorAll("span.br-w")) {
    if (wrap.parentElement) wrap.className = `br-w ${toneClass(wrap.parentElement)}`;
  }
}

let retoneTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleRetone(): void {
  if (!bolded) return;
  clearTimeout(retoneTimer);
  retoneTimer = setTimeout(retone, 150);
}

// Theme switches usually flip a class, style or data attribute on <html> or <body>, or follow the OS setting.
const THEME_ATTRS = { attributes: true, attributeOldValue: true, attributeFilter: ["class", "style", "data-theme", "data-color-mode", "data-mode"] };
const withoutOurClasses = (v: string | null) => (v ?? "").split(/\s+/).filter((c) => c && !c.startsWith("br-")).sort().join(" ");
const themeObserver = new MutationObserver((records) => {
  // Our own br-* classes on <html> (spotlight, skim) are not a theme change.
  const changed = records.some((r) =>
    r.attributeName !== "class" || withoutOurClasses(r.oldValue) !== withoutOurClasses((r.target as Element).getAttribute("class")),
  );
  if (changed) scheduleRetone();
});
themeObserver.observe(document.documentElement, THEME_ATTRS);
if (document.body) themeObserver.observe(document.body, THEME_ATTRS);
else document.addEventListener("DOMContentLoaded", () => themeObserver.observe(document.body, THEME_ATTRS), { once: true });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", scheduleRetone);

function boldTextNode(node: Text, strength: Strength): void {
  const text = node.nodeValue ?? "";
  const parts = splitText(text);
  if (!parts.some((p) => p.word)) return;
  const wrap = document.createElement("span");
  wrap.className = node.parentElement ? `br-w ${toneClass(node.parentElement)}` : "br-w";
  for (const part of parts) {
    if (!part.word) {
      wrap.append(part.text);
      continue;
    }
    const [head, tail] = splitWord(part.text, strength);
    const b = document.createElement("b");
    b.className = "br-b";
    b.textContent = head;
    wrap.append(b);
    if (tail) {
      const t = document.createElement("span");
      t.className = "br-t";
      t.textContent = tail;
      wrap.append(t);
    }
  }
  node.replaceWith(wrap);
}

function collectTextNodes(root: Node): Text[] {
  if (root.nodeType === Node.TEXT_NODE) {
    const t = root as Text;
    return t.nodeValue?.trim() && !shouldSkip(t.parentElement) ? [t] : [];
  }
  if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) return [];
  if (root instanceof Element && shouldSkip(root)) return [];
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.nodeValue?.trim() && !shouldSkip(n.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
}

const idle: (cb: () => void) => void =
  typeof requestIdleCallback === "function" ? (cb) => requestIdleCallback(cb, { timeout: 200 }) : (cb) => setTimeout(cb, 16);

/** Bold all text under `roots` in small batches so huge pages stay responsive. */
function boldRoots(roots: Node[]): void {
  const queue = roots.flatMap(collectTextNodes);
  const strength = activeStrength;
  const step = () => {
    if (!bolded || strength !== activeStrength) return; // turned off or changed meanwhile
    const batch = queue.splice(0, BATCH);
    withObserverPaused(() => {
      for (const node of batch) if (node.isConnected && !shouldSkip(node.parentElement)) boldTextNode(node, strength);
    });
    if (queue.length) idle(step);
  };
  step();
}

function unbold(): void {
  withObserverPaused(() => {
    const parents = new Set<Node>();
    for (const span of document.querySelectorAll("span.br-w")) {
      if (span.parentNode) parents.add(span.parentNode);
      span.replaceWith(document.createTextNode(span.textContent ?? ""));
    }
    for (const p of parents) p.normalize();
  });
}

// ---------- MutationObserver for new content ----------

let pending: Node[] = [];
let debounce: ReturnType<typeof setTimeout> | undefined;
const observer = new MutationObserver((records) => {
  for (const r of records) for (const n of r.addedNodes) pending.push(n);
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    const nodes = pending.filter((n) => n.isConnected);
    pending = [];
    if (bolded && nodes.length) boldRoots(nodes);
  }, 250);
});
let observing = false;

function observe(on: boolean): void {
  if (on && !observing) observer.observe(document.body, { childList: true, subtree: true });
  if (!on && observing) observer.disconnect();
  observing = on;
}

/** Our own DOM edits must not trigger the observer. */
function withObserverPaused(fn: () => void): void {
  const was = observing;
  observe(false);
  try {
    fn();
  } finally {
    if (was) observe(true);
  }
}

function setBolded(on: boolean, strength: Strength): void {
  if (on && bolded && strength === activeStrength) return;
  if (bolded) unbold();
  bolded = on;
  activeStrength = strength;
  if (on) {
    observe(true);
    boldRoots([document.body]);
  } else {
    observe(false);
    pending = [];
  }
}

// ---------- Paragraph spotlight ----------

const BLOCK = "p, li, h1, h2, h3, h4, h5, h6, blockquote, dd, dt, figcaption, td, th, pre, .br-tldr, .br-chunk";
let spotActive: Element | null = null;
let rafPending = false;
let lastTarget: EventTarget | null = null;

function clearSpot(): void {
  for (const el of document.querySelectorAll(".br-spot-active, .br-spot-anc")) el.classList.remove("br-spot-active", "br-spot-anc");
  spotActive = null;
}

/**
 * The focused block is zoomed, which reflows the page. Keep `anchor` at the same spot on screen
 * so the paragraph you are reading does not jump away from the cursor.
 */
function keepInPlace(anchor: Element | null, change: () => void): void {
  const before = anchor?.getBoundingClientRect().top;
  change();
  if (anchor && before !== undefined && anchor.isConnected) {
    const delta = anchor.getBoundingClientRect().top - before;
    if (Math.abs(delta) > 0.5) window.scrollBy(0, delta);
  }
}

function updateSpot(): void {
  rafPending = false;
  const target = lastTarget instanceof Element ? lastTarget : null;
  const block = target?.closest(BLOCK);
  if (!block || block === spotActive) return;
  keepInPlace(block, () => {
    clearSpot();
    spotActive = block;
    block.classList.add("br-spot-active");
    for (let a = block.parentElement?.closest(BLOCK); a; a = a.parentElement?.closest(BLOCK)) a.classList.add("br-spot-anc");
    document.documentElement.classList.add("br-spot-on");
  });
}

/** Clicking anywhere that isn't text shows the whole page again, until you hover a paragraph. */
function onClick(e: MouseEvent): void {
  if (!spotActive) return;
  const target = e.target instanceof Element ? e.target : null;
  if (target?.closest(BLOCK)) return;
  keepInPlace(spotActive, () => {
    clearSpot();
    document.documentElement.classList.remove("br-spot-on");
  });
}

function onMove(e: MouseEvent): void {
  lastTarget = e.target;
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(updateSpot);
  }
}

function setSpotlight(on: boolean): void {
  document.removeEventListener("mousemove", onMove, { capture: true });
  document.removeEventListener("click", onClick, { capture: true });
  if (on) {
    document.addEventListener("mousemove", onMove, { capture: true, passive: true });
    document.addEventListener("click", onClick, { capture: true, passive: true });
  } else {
    keepInPlace(spotActive, clearSpot);
    document.documentElement.classList.remove("br-spot-on");
  }
}

// ---------- AI: paragraph extraction and results ----------

const PARA = "p, li, blockquote, dd";
const CHROME = "nav, header, footer, aside, form, [role=navigation], [role=banner], [role=contentinfo], [aria-hidden=true], .br-ui";

function pickRoot(): Element {
  const textLen = (el: Element) => (el as HTMLElement).innerText?.length ?? 0;
  const candidates = [...document.querySelectorAll("article, main, [role=main]")];
  candidates.sort((a, b) => textLen(b) - textLen(a));
  return candidates[0] && textLen(candidates[0]) > 500 ? candidates[0] : document.body;
}

export function extractParagraphs(): { title: string; els: HTMLElement[]; paragraphs: Paragraph[] } {
  const root = pickRoot();
  const els = ([...root.querySelectorAll(PARA)] as HTMLElement[]).filter((el) => {
    if (el.closest(CHROME) || el.isContentEditable) return false;
    if (el.querySelector(PARA)) return false; // keep leaf paragraphs only
    if (!el.getClientRects().length) return false; // hidden
    return wordCount(el.innerText) >= 12;
  });
  const paragraphs = els.map((el, i) => {
    el.dataset.brId = `p${i}`;
    return { id: `p${i}`, text: el.innerText.trim().replace(/\s+/g, " ").slice(0, 4000) };
  });
  const title = (document.querySelector("h1") as HTMLElement | null)?.innerText.trim() || document.title;
  return { title, els, paragraphs };
}

function clearAnalysis(): void {
  withObserverPaused(() => {
    document.querySelectorAll(".br-ui").forEach((el) => el.remove());
    document.querySelectorAll("[data-br-id]").forEach((el) => {
      el.classList.remove("br-dense", "br-key", "br-analyzed", "br-orig-hidden");
      delete (el as HTMLElement).dataset.brId;
    });
  });
  document.documentElement.classList.remove("br-has-analysis");
}

function ctlButton(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "br-ctl";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function bulletList(items: string[]): HTMLUListElement {
  const ul = document.createElement("ul");
  for (const t of items) {
    const li = document.createElement("li");
    li.textContent = t;
    ul.append(li);
  }
  return ul;
}

function renderAnalysis(els: HTMLElement[], a: Analysis): void {
  const byId = new Map(els.map((el) => [el.dataset.brId!, el]));
  withObserverPaused(() => {
    for (const el of els) el.classList.add("br-analyzed");
    for (const id of a.keyIds) byId.get(id)?.classList.add("br-key");

    if (a.tldr.length && els[0]) {
      const box = document.createElement("section");
      box.className = "br-ui br-tldr";
      const h = document.createElement("strong");
      h.className = "br-ui-title";
      h.textContent = "TL;DR";
      box.append(h, bulletList(a.tldr), ctlButton("Hide", () => box.remove()));
      els[0].before(box);
    }

    for (const chunk of a.chunks) {
      const el = byId.get(chunk.id);
      if (!el) continue;
      el.classList.add("br-dense");
      const box = document.createElement("div");
      box.className = "br-ui br-chunk";
      const list = bulletList(chunk.bullets);
      const inList = el.tagName === "LI";
      const toggle = ctlButton(inList ? "Hide bullets" : "Show original", () => {
        if (inList) {
          list.hidden = !list.hidden;
          toggle.textContent = list.hidden ? "Show bullets" : "Hide bullets";
        } else {
          const hidden = el.classList.toggle("br-orig-hidden");
          toggle.textContent = hidden ? "Show original" : "Hide original";
        }
      });
      box.append(list, toggle);
      if (inList) {
        el.append(box); // a <div> can't sit directly inside <ul>
      } else {
        el.classList.add("br-orig-hidden");
        el.after(box);
      }
    }
  });
  document.documentElement.classList.add("br-has-analysis");
  if (bolded) boldRoots([...document.querySelectorAll(".br-ui")]);
}

async function runAnalysis(): Promise<AnalyzeResponse & { counts?: { paragraphs: number; dense: number; key: number } }> {
  clearAnalysis();
  const { title, els, paragraphs } = extractParagraphs();
  if (!paragraphs.length) return { ok: false, error: "No article paragraphs found on this page." };
  const req: AnalyzeRequest = { type: "br-analyze", title, paragraphs };
  const res = (await chrome.runtime.sendMessage(req)) as AnalyzeResponse | undefined;
  if (!res) return { ok: false, error: "The extension did not answer. Try again." };
  if (!res.ok) return res;
  renderAnalysis(els, res.analysis);
  return {
    ...res,
    counts: { paragraphs: paragraphs.length, dense: res.analysis.chunks.length, key: res.analysis.keyIds.length },
  };
}

// ---------- Wiring ----------

function apply(s: Settings): void {
  settings = s;
  // Two separate switches per site, both off until the user turns them on.
  setBolded(s.sites[host] === true, s.strength);
  setSpotlight(s.focusSites[host] === true);
  // Skim only shows after the user runs Summarize on this page.
  document.documentElement.classList.toggle("br-skim-on", s.skim);
}

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "sync") loadSettings().then(apply);
});

chrome.runtime.onMessage.addListener((msg: { type?: string }, _sender, sendResponse) => {
  if (msg?.type === "br-run-analysis") {
    runAnalysis()
      .then(sendResponse)
      .catch((err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    return true; // async response
  }
  if (msg?.type === "br-clear-analysis") {
    clearAnalysis();
    sendResponse({ ok: true });
  }
  if (msg?.type === "br-status") {
    sendResponse({ host, bolded, hasAnalysis: document.documentElement.classList.contains("br-has-analysis") });
  }
  return false;
});

if (document.body) loadSettings().then(apply);
else document.addEventListener("DOMContentLoaded", () => loadSettings().then(apply), { once: true });

// For tests that inject this file with a stubbed chrome.storage.
(globalThis as { __kuro?: unknown }).__kuro = { apply: (raw: unknown) => apply(normalizeSettings(raw as never)), renderAnalysis, extractParagraphs };
