import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

export const obsidianExecutable = process.env.OBSIDIAN_CLI ?? (existsSync("E:/Useful Files/Obsidian/Obsidian.com") ? "E:/Useful Files/Obsidian/Obsidian.com" : "obsidian");
const vaultName = process.env.OBSIDIAN_VAULT ?? basename(fileURLToPath(new URL("../../../", import.meta.url)));
let sequence = 0;

export function obsidian(...args) {
  const output = execFileSync(obsidianExecutable, [`vault=${vaultName}`, ...args], { encoding: "utf8", windowsHide: true, timeout: 30000 }).trim();
  if (/^(Error:|Command line interface is not enabled)/m.test(output)) throw new Error(output);
  return output;
}

export function evaluate(code) {
  // Keep large fixture text and multiline JavaScript out of Windows CLI arguments.
  const script = join(tmpdir(), `foresight-obsidian-${process.pid}-${++sequence}.js`);
  writeFileSync(script, `(async()=>{const value=await(async()=>{${code}})();return JSON.stringify(value);})()`);
  try {
    const output = obsidian("eval", `code=eval(require("node:fs").readFileSync(${JSON.stringify(script.replaceAll("\\", "/"))},"utf8"))`);
    const result = output.match(/^=> (.*)$/m);
    if (!result) throw new Error(`没有 eval 结果：${output}`);
    return JSON.parse(result[1]);
  } finally { unlinkSync(script); }
}

if (process.argv[1]?.endsWith("obsidian-cli.mjs")) {
  if (process.argv[2] === "eval") console.log(JSON.stringify(evaluate(process.argv.slice(3).join(" ")), null, 2));
  else console.log(obsidian(...process.argv.slice(2)));
}
