import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const vault = resolve(process.argv[2] ?? join(root, "../.."));
if (!(await stat(join(vault, ".obsidian"))).isDirectory()) throw new Error(`不是 Obsidian vault：${vault}`);
const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
const target = join(vault, ".obsidian", "plugins", manifest.id);
await mkdir(target, { recursive: true });
for (const name of ["main.js", "manifest.json", "styles.css"]) {
  await copyFile(join(root, "dist", name), join(target, name));
}
console.log(`已安装至 ${target}。在 Obsidian 社区插件中启用 ${manifest.name}。`);
