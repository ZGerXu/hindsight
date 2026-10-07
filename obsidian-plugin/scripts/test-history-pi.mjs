import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHistory, locateHistory } from "../src/features/history-references/parser.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const project = resolve(root, "..");
const results = join(root, "test-results");
const course = join(results, "pi-history-course");
const original = join(project, "../curricula/deep-reinforcement-learning-hands-on/transcripts/archive.md");
const notebook = join(project, "../Notebook.md");
const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const before = { archive: hash(original), notebook: hash(notebook) };
const source = readFileSync(original, "utf8");
mkdirSync(join(course, "transcripts"), { recursive: true });
writeFileSync(join(course, "course.md"), "# 历史引用开发验收\n\n仅在此副本中绑定、记录生成结果，不修改真实课程状态。\n");
writeFileSync(join(course, "transcripts/archive.md"), source);
writeFileSync(join(course, "transcripts/state.json"), JSON.stringify({ version: 1, id: parseHistory(source).events.values().next().value.archiveId, mirror: null }));
const prompt = `/skill:curriculum 这是历史引用功能的开发验收，使用隔离的课程副本 ${course.replaceAll("\\", "/")}，不是开启教学或评估，不创建检查点。先读取课程 skill 和 references/history-references.md，绑定这个副本，再用 curriculum_history 查核历史。
请把下面这段旧讲解改写为一段可独立阅读的中文教材正文，保留它连接旧知识与新视角的目的，并依课程规则引用实际旧 quiz 的题目与回答。不要输出开发说明，不要发新测验，不要逐一汇报工具过程。最终回复只含这一小段正文及其脚注定义。
旧讲解：U001 里我们给整条已结束的回合打总分：把所有奖励加起来，D01 你就是这样比较两条策略的。但真实的 agent 不是站在回合结束后，而是站在中途的 t 时刻选下一步动作——过去的奖励已经入账，改不了了；此刻的选择只能影响还没发生的那些奖励。
可用历史搜索短语：路线 A 的两步奖励。不得把新解释伪装成旧原话，不能从单元编号猜事件 ID。只操作这个测试副本与项目 skill 文件。`;
const launcher = join(homedir(), ".pi/agent/bin/pi-launcher.js");
const args = [launcher, "--model", "zai-coding-cn/glm-5.3", "--extension", join(project, "extensions/md-log.ts"), "--skill", join(project, "skills/curriculum/SKILL.md"), "--tools", "read,grep,curriculum_transcript,curriculum_history", "--no-mcp", "--no-session", "--approve", "--print", "--mode", "json", prompt];
console.log("运行 Pi Agent zai-coding-cn/glm-5.3（隔离转录副本）…");
const child = spawn(process.execPath, args, { cwd: project, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
let stdout = "", stderr = "";
child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
child.stdout.on("data", (data) => { stdout += data; });
child.stderr.on("data", (data) => { stderr += data; });
const deadline = setTimeout(() => child.kill(), 600000);
const heartbeat = setInterval(() => console.log("等待 glm-5.3 完成历史查核与引用输出…"), 30000);
let report;
try {
  const code = await new Promise((accept, reject) => { child.on("error", reject); child.on("exit", accept); });
  writeFileSync(join(results, "pi-history-events.jsonl"), stdout);
  writeFileSync(join(results, "pi-history-stderr.log"), stderr);
  assert.equal(code, 0, "Pi Agent 应成功退出");
  const stream = stdout.split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
  const messages = stream.filter((event) => event.type === "message_end").map((event) => event.message);
  const assistant = messages.filter((message) => message.role === "assistant");
  assert.ok(assistant.length, "应记录助手实际响应");
  assert.ok(assistant.every((message) => message.model === "glm-5.3"), "实际执行模型必须是 glm-5.3");
  const calls = stream.filter((event) => event.type === "tool_execution_start").map((event) => event.toolName);
  assert.ok(calls.includes("curriculum_history"), "模型应调用真实历史查询工具");
  assert.ok(calls.includes("curriculum_transcript"), "模型应绑定隔离课程");
  const final = assistant.at(-1).content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
  const parsed = parseHistory(final);
  assert.ok(parsed.occurrences.length, "最终正文应包含有效的历史引用");
  assert.equal(parsed.issues.length, 0, "历史引用协议应有效");
  const prose = final.split(/\n\[\^history-/)[0];
  assert.ok(!/\b(?:U\d{3}|D\d{2})\b/.test(prose), "讲解正文不应含裸单元／诊断出处");
  const lookup = parseHistory(source);
  for (const citation of parsed.citations.values()) assert.ok(locateHistory(lookup, citation.reference).length >= 2, "quiz 应同时引用原题与已返回回答");
  const transcript = parseHistory(readFileSync(join(course, "transcripts/archive.md"), "utf8"));
  assert.ok(transcript.occurrences.some((occurrence) => /^history-[a-f0-9]{64}-/.test(occurrence.citation.id)), "实际 md-log 应为生成结果添加事件命名空间");
  writeFileSync(join(results, "pi-history-lesson.md"), final + "\n");
  report = { passed: true, model: "glm-5.3", provider: "zai-coding-cn", calls, references: [...parsed.citations.values()].map((citation) => citation.reference), before, after: { archive: hash(original), notebook: hash(notebook) } };
  assert.deepEqual(report.after, before, "真实课程原本与 Notebook 不应被测试改写");
  console.log(`PASS glm-5.3 生成 ${parsed.occurrences.length} 个有效历史引用，原记录均存在，真实笔记哈希不变。`);
} catch (error) {
  report = { passed: false, model: "glm-5.3", error: error.stack ?? String(error), before, after: { archive: hash(original), notebook: hash(notebook) } };
  process.exitCode = 1;
  console.error(error);
} finally {
  clearTimeout(deadline); clearInterval(heartbeat);
  writeFileSync(join(results, "pi-history.json"), JSON.stringify(report, null, 2));
}
