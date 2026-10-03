import { context } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const watching = process.argv.includes("--watch");
await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
const build = await context({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.js",
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  external: ["obsidian", "@codemirror/state", "@codemirror/view", "node:path", "node:url"],
  sourcemap: watching ? "inline" : false,
  minify: !watching,
  logLevel: "info"
});
for (const name of ["manifest.json", "styles.css"]) {
  await copyFile(new URL(`../${name}`, import.meta.url), new URL(`../dist/${name}`, import.meta.url));
}
if (watching) await build.watch();
else { await build.rebuild(); await build.dispose(); }
