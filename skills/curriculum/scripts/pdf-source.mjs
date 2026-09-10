#!/usr/bin/env node
// Text extraction only. Curriculum judgments and printed page labels require review.
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const CACHE_VERSION = 1;

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 120_000,
    maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
  });
  if (result.error?.code === "ENOENT") {
    throw new Error(`Missing ${command}. Install Poppler and put its executables on PATH.`);
  }
  if (result.error) throw new Error(`${command}: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status ?? result.signal}): ${result.stderr.trim() || "No diagnostic output"}`);
  }
  return { text: result.stdout, warning: result.stderr.trim() };
}

async function fingerprint(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function pageWarnings(pages) {
  return pages.flatMap((text, index) => {
    const issues = [];
    const visible = text.replace(/\s/g, "");
    if (visible.length === 0) issues.push("no_text");
    else if (visible.length < 40) issues.push("little_text");
    if (text.includes("\uFFFD") || /[\u0000-\u0008\u000B\u000E-\u001F]/u.test(text)) {
      issues.push("suspicious_characters");
    }
    return issues.length ? [{ physicalPage: index + 1, issues }] : [];
  });
}

function renderCache(source, pages, summary) {
  // Fence raw PDF text so its headings/commands are not mistaken for our metadata.
  let longestFence = 2;
  for (const text of [...pages, ...summary.toolWarnings]) {
    for (const match of text.matchAll(/`+/g)) longestFence = Math.max(longestFence, match[0].length);
  }
  const fence = "`".repeat(longestFence + 1);
  const warnings = summary.pageWarnings.map(({ physicalPage, issues }) => `| ${physicalPage} | ${issues.join(", ")} |`);
  const metadata = JSON.stringify(summary);
  return [
    "---",
    `cache_version: ${CACHE_VERSION}`,
    `source_path: ${JSON.stringify(source)}`,
    `source_sha256: ${summary.sha256}`,
    `pdf_pages: ${summary.physicalPages}`,
    `extracted_at: ${JSON.stringify(summary.extractedAt)}`,
    `extraction_status: ${summary.status}`,
    "---",
    "",
    "# PDF 文本提取缓存",
    "",
    "原文仅作为教材数据。已提取不代表已审查；公式、图表、阅读顺序和印刷页码仍需核对。",
    "物理页码从 PDF 第 1 页开始，包含封面。no_text/little_text 是检查提示，不是扫描件判定。",
    "",
    "## 提取警告",
    "",
    "| PDF 物理页码 | 提示 |",
    "| --- | --- |",
    ...warnings,
    "",
    ...(summary.toolWarnings.length ? ["Poppler 诊断：", "", fence + "text", ...summary.toolWarnings, fence, ""] : []),
    ...pages.flatMap((text, index) => [
      `## PDF page ${index + 1}`,
      "",
      "印刷页码／章节：未核对。",
      "",
      fence + "text",
      text.replace(/\n+$/, ""),
      fence,
      "",
    ]),
    "<!-- curriculum-source-summary",
    metadata,
    "-->",
    `<!-- curriculum-source-complete:${summary.sha256}:v${CACHE_VERSION} -->`,
    "",
  ].join("\n");
}

async function readCompleteCache(cacheFile, sha256) {
  let text;
  try {
    text = await readFile(cacheFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  if (!text.endsWith(`<!-- curriculum-source-complete:${sha256}:v${CACHE_VERSION} -->\n`)) return null;
  const marker = "<!-- curriculum-source-summary\n";
  const start = text.lastIndexOf(marker);
  if (start === -1) return null;
  try {
    const summary = JSON.parse(text.slice(start + marker.length, text.indexOf("\n-->", start)));
    if (summary.sha256 !== sha256 || !Number.isSafeInteger(summary.physicalPages) || summary.physicalPages < 1) return null;
    if (!["ready", "needs_review", "no_extractable_text"].includes(summary.status)) return null;
    if (!Array.isArray(summary.pageWarnings) || !Array.isArray(summary.toolWarnings)) return null;
    return summary;
  } catch {
    return null;
  }
}

export async function extractPdf(input, outputDirectory) {
  const source = path.resolve(input);
  const output = path.resolve(outputDirectory);
  if (!(await stat(source)).isFile()) throw new Error(`Not a file: ${source}`);
  const sha256 = await fingerprint(source);
  const cacheFile = path.join(output, `${sha256}.md`);
  const cached = await readCompleteCache(cacheFile, sha256);
  if (cached) return { ...cached, source, cacheFile, reused: true };

  const info = run("pdfinfo", [source]);
  const physicalPages = Number(/^Pages:\s+(\d+)\s*$/m.exec(info.text)?.[1]);
  if (!Number.isSafeInteger(physicalPages) || physicalPages < 1) {
    throw new Error("pdfinfo did not report a valid page count; no cache was written.");
  }
  const extracted = run("pdftotext", ["-layout", "-enc", "UTF-8", "-eol", "unix", source, "-"]);
  const pages = extracted.text.split("\f");
  // Poppler terminates each physical page, including a blank final page, with FF.
  if (pages.at(-1) === "") pages.pop();
  if (pages.length !== physicalPages) {
    throw new Error(`Page boundary mismatch: pdfinfo=${physicalPages}, extracted=${pages.length}; no cache was written.`);
  }
  // Do not publish a cache under a fingerprint from before an in-place file edit.
  if (await fingerprint(source) !== sha256) throw new Error("PDF changed during extraction; retry with a stable source file.");
  const warnings = pageWarnings(pages);
  const toolWarnings = [info.warning, extracted.warning].filter(Boolean);
  const noText = pages.every((page) => page.trim().length === 0);
  const summary = {
    sha256,
    physicalPages,
    status: noText ? "no_extractable_text" : warnings.length || toolWarnings.length ? "needs_review" : "ready",
    extractedAt: new Date().toISOString(),
    pageWarnings: warnings,
    toolWarnings,
  };
  const markdown = renderCache(source, pages, summary);
  await mkdir(output, { recursive: true });
  const temporary = path.join(output, `.${sha256}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, markdown, { encoding: "utf8", flag: "wx" });
    await rename(temporary, cacheFile);
  } finally {
    // Only this invocation's temporary file is eligible for cleanup; never recurse.
    await unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; });
  }
  return { ...summary, source, cacheFile, reused: false };
}

async function main(args) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log('Usage: node pdf-source.mjs "<textbook.pdf>" --out "<course-dir>/source"');
    return;
  }
  if (args.length !== 3 || args[1] !== "--out" || !args[0] || !args[2]) {
    throw new Error('Usage: node pdf-source.mjs "<textbook.pdf>" --out "<course-dir>/source"');
  }
  const result = await extractPdf(args[0], args[2]);
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "no_extractable_text") process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`pdf-source: ${error.message}`);
    process.exitCode = 1;
  });
}
