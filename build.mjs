import * as esbuild from "esbuild";
import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const watch = process.argv.includes("--watch");
const entries = ["src/content.ts", "src/popup.ts", "src/background.ts"];
const staticFiles = ["manifest.json", "content.css", "popup.html", "popup.css"];

async function copyStatic() {
  await mkdir("dist", { recursive: true });
  for (const f of staticFiles) {
    await cp(f, `dist/${f}`).catch((e) => {
      if (e.code !== "ENOENT") throw e; // file not written yet
    });
  }
}

const ctx = await esbuild.context({
  entryPoints: entries.filter((f) => existsSync(f)), // skip files not written yet
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome120",
  platform: "browser",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
  plugins: [{ name: "static", setup: (b) => b.onEnd(copyStatic) }],
});

if (watch) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
