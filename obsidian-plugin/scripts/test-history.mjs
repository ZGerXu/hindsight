import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { parseHistory, locateHistory, historyPosition, eventKey } from "../src/features/history-references/parser.ts";
import { record, questionRecord, answerRecord, branchRecords } from "../../extensions/md-log/records.mjs";
import { TranscriptArchive } from "../../extensions/md-log/archive.mjs";
import { findHistory } from "../../extensions/md-log/history.mjs";
import mdLog from "../../extensions/md-log.ts";

const archiveId = "b844295d-db3a-49f3-b645-59f5767443f3";
const eventIds = ["1".repeat(64), "2".repeat(64)];
const uri = "file:///E:/Learning/transcripts/archive.md";
const ref = { archive_id: archiveId, archive_uri: uri, event_ids: eventIds };
const definition = (id = "history-1", overrides = {}, version = 1) => {
  const value = { ...ref, ...overrides };
  return `[^${id}]: [回顾·两步奖励比较](<${value.archive_uri}#mdlog-${value.event_ids[0]}>) <!-- history-ref:v${version} ${JSON.stringify(value)} -->`;
};
const events = `<!-- md-log:archive:${archiveId} -->\n# 学习转录\n\n<!-- md-log:event:${eventIds[0]} -->\n> [!question] Quiz\n> 路线 A 的奖励为 $+5,-6$，路线 B 为 $0,+2$。\n\n<!-- md-log:event:${eventIds[1]} -->\n> [!success] Quiz — correct ✓\n> Your answer: 2. 选 B\n> Correct answer: 2\n> 两步之和：A 得 −1，B 得 2。\n\n`;

test("历史引用关联 callout、普通脚注与真实事件，代码和注释示例不参与", () => {
  const markdown = events + `\n比较[^history-1] 与个人脚注[^personal]。\n\n${definition()}\n\n[^personal]: 个人记录\n\n> [!note] 回顾\n> 回答[^history-2]。\n>\n> ${definition("history-2")}\n\n\`\`\`markdown\n例子[^history-code]\n${definition("history-code")}\n<!-- md-log:event:${"3".repeat(64)} -->\n\`\`\`\n\n\`例子[^history-inline]\`，转义 \\[^history-1]。\n\n<!--\n${definition("history-comment")}\n-->`;
  const parsed = parseHistory(markdown);
  assert.deepEqual([...parsed.citations.keys()], ["history-1", "history-2"]);
  assert.equal(parsed.occurrences.length, 2);
  assert.equal(parsed.events.size, 2);
  assert.equal(locateHistory(parsed, ref)[0].id, eventIds[0]);
  assert.ok(!parsed.events.has(eventKey(archiveId, "3".repeat(64))));
});

test("未知协议、缺字段、链接不一致、重复定义保留原显示", () => {
  for (const source of [definition("history-1", {}, 2), definition("history-1", { archive_id: "other" }), definition("history-1", { event_ids: ["D01"] }), definition("history-1", { event_ids: [eventIds[0], eventIds[0]] }), definition("history-1", { quote: "x".repeat(121) }), definition().replace("#mdlog-1", "#mdlog-2"), definition().replace('"archive_uri":"file:', '"archive_uri":"https:'), definition() + "\n\n" + definition()]) {
    const parsed = parseHistory("正文[^history-1]。\n\n" + source);
    assert.equal(parsed.citations.size, 0);
    assert.equal(parsed.occurrences.length, 0);
    assert.ok(parsed.issues.length);
  }
});

test("UUID、事件顺序、缺失记录和不匹配锚点不能误定位", () => {
  const parsed = parseHistory(events);
  for (const reference of [{ ...ref, archive_id: "0".repeat(36) }, { ...ref, event_ids: [...eventIds].reverse() }, { ...ref, event_ids: ["3".repeat(64)] }, { ...ref, quote: "这不是原文" }]) assert.throws(() => locateHistory(parsed, reference));
  const duplicated = parseHistory(events + `<!-- md-log:event:${eventIds[0]} -->\n重复记录\n`);
  assert.throws(() => locateHistory(duplicated, ref));
  const closed = parseHistory(events + `<!-- md-log:${archiveId}:end -->\n<!-- md-log:event:${"3".repeat(64)} -->\n别的记录\n`);
  assert.equal(closed.events.size, 2);
});

test("内容前插与 CRLF 不影响事件/短引文的精准位置", () => {
  for (const markdown of [events, "前言\n\n" + events, events.replaceAll("\n", "\r\n")]) {
    const parsed = parseHistory(markdown);
    const quote = "路线 A 的奖励为";
    const selected = locateHistory(parsed, { ...ref, quote })[0];
    const position = historyPosition(markdown, selected, quote);
    assert.equal(markdown.slice(position.from, position.to), quote);
    assert.equal(position.line, markdown.slice(0, position.from).split("\n").length - 1);
  }
});

test("md-log 独立命名空间、工具反馈与重放保持稳定，代码与元数据不改写", () => {
  const message = `正文[^history-1]。\n\n${definition()}\n\n\`[^history-code]\`\n\n\`\`\`md\n[^history-code]\n${definition("history-code")}\n\`\`\``;
  const saved = record("lesson", message, process.cwd());
  assert.equal(record("lesson", saved.text, process.cwd()).text, saved.text);
  assert.ok(saved.text.includes(`[^history-${saved.id}-1]`));
  assert.ok(saved.text.includes(`"event_ids":${JSON.stringify(eventIds)}`));
  assert.ok(saved.text.includes("`[^history-code]`"));
  assert.ok(saved.text.includes(definition("history-code")));
  const input = { question: "题目", options: [{ value: "b", label: "B" }, { value: "a", label: "A" }], correctAnswer: "b", explanation: message };
  const details = { status: "answered", correct: true, answers: [{ index: 1, label: "B" }], correctIndices: [1], options: input.options, explanation: message };
  const question = questionRecord("quiz1", "quiz", input, input.options, process.cwd());
  assert.ok(!question.text.includes("history-ref"));
  assert.ok(!question.text.includes("Correct answer"));
  const answer = answerRecord("quiz1", "quiz", details, process.cwd());
  assert.ok(answer.text.includes(`[^history-${answer.id}-1]`));
  const replay = branchRecords([{ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "quiz1", name: "quiz", arguments: input }] } }, { type: "message", message: { role: "toolResult", toolCallId: "quiz1", toolName: "quiz", details } }], process.cwd());
  assert.deepEqual(replay, [question, answer]);
});

test("历史查询配对已转录的 quiz 问答，不返回待答工具答案", () => {
  const found = findHistory(events, "路线 A 的奖励");
  assert.equal(found.archive_id, archiveId);
  assert.deepEqual(found.events.map((event) => event.event_id), eventIds);
  assert.equal(findHistory(events, "不存在").events.length, 0);
  assert.throws(() => findHistory(events, " "));
  const pending = events.split(`<!-- md-log:event:${eventIds[1]}`)[0];
  const result = findHistory(pending, "路线 A");
  assert.equal(result.events.length, 1);
  assert.ok(!JSON.stringify(result).includes("Correct answer"));
});

test("实际扩展绑定、查询和镜像同步保留引用，旧内容不回写", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "foresight-history-"));
  try {
    const course = join(temporary, "course");
    const archive = new TranscriptArchive(join(course, "transcripts"), "测试课程");
    writeFileSync(join(course, "course.md"), "# 课程");
    archive.append([{ id: eventIds[0], text: "> [!question] Quiz\n> 旧题目" }, { id: eventIds[1], text: "> [!success] Quiz — correct ✓\n> 实际回答" }]);
    const tools = new Map();
    (typeof mdLog === "function" ? mdLog : mdLog.default)({ on() {}, registerCommand() {}, appendEntry() {}, registerTool(tool) { tools.set(tool.name, tool); } });
    const ctx = { cwd: temporary, ui: { notify() {}, setStatus() {} }, sessionManager: { getBranch: () => [], getSessionId: () => "test", getHeader: () => ({ timestamp: "test" }) } };
    assert.equal((await tools.get("curriculum_history").execute("test", { query: "旧题目" })).isError, true);
    assert.ok(!(await tools.get("curriculum_transcript").execute("test", { course_dir: course }, null, null, ctx)).isError);
    const result = await tools.get("curriculum_history").execute("test", { query: "旧题目" });
    assert.equal(result.details.archive_uri, pathToFileURL(archive.file).href);
    assert.deepEqual(result.details.events.map((event) => event.event_id), eventIds);
    const before = readFileSync(archive.file, "utf8");
    const mirror = join(temporary, "Notebook.md");
    writeFileSync(mirror, "个人笔记\n");
    archive.link(mirror);
    archive.append([record("new", `比较[^history-1]。\n\n${definition()}`, temporary)]);
    archive.sync(mirror);
    assert.ok(readFileSync(archive.file, "utf8").startsWith(before));
    assert.ok(readFileSync(mirror, "utf8").startsWith("个人笔记\n"));
    assert.equal(parseHistory(readFileSync(mirror, "utf8")).occurrences.length, 1);
    const synced = readFileSync(mirror, "utf8");
    archive.sync(mirror);
    assert.equal(readFileSync(mirror, "utf8"), synced);
  } finally { rmSync(temporary, { recursive: true }); }
});

test("协议文档中的历史问答实例符合解析协议", () => {
  const protocol = readFileSync(new URL("../../skills/curriculum/references/history-references.md", import.meta.url), "utf8");
  const example = protocol.match(/```markdown\n([\s\S]*?)\n```/)[1];
  const parsed = parseHistory(example);
  assert.equal(parsed.issues.length, 0);
  assert.equal(parsed.occurrences.length, 1);
  assert.equal([...parsed.citations.values()][0].reference.event_ids.length, 2);
});
