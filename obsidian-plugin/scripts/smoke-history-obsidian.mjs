import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseHistory, locateHistory, historyPosition } from "../src/features/history-references/parser.ts";
import { parseCitations } from "../src/features/textbook-references/parser.ts";
import { evaluate, obsidian } from "./obsidian-cli.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const results = join(root, "test-results");
mkdirSync(results, { recursive: true });
const notebookPath = join(root, "../../Notebook.md");
const archivePath = join(root, "../../curricula/deep-reinforcement-learning-hands-on/transcripts/archive.md");
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const notebook = readFileSync(notebookPath, "utf8");
const original = parseHistory(notebook);
const protocol = readFileSync(join(root, "../skills/curriculum/references/history-references.md"), "utf8");
const example = protocol.match(/```markdown\n([\s\S]*?)\n```/)[1];
const quiz = [...parseHistory(example).citations.values()][0].reference;
const knowledge = [...original.events.values()].find((event) => event.markdown.includes("无折扣、有限回合时就是简单求和"));
const codeEvent = [...original.events.values()].find((event) => event.markdown.includes("```python"));
assert.ok(knowledge && codeEvent, "真实转录应包含被引用的讲解和代码");
const knowledgeRef = { ...quiz, event_ids: [knowledge.id], quote: "无折扣、有限回合时就是简单求和" };
const codeRef = { ...quiz, event_ids: [codeEvent.id] };
const piReport = JSON.parse(readFileSync(join(results, "pi-history.json"), "utf8"));
assert.ok(piReport.passed && piReport.model === "glm-5.3", "先运行 test:history:pi 并通过 glm-5.3 验收");
const piLesson = readFileSync(join(results, "pi-history-lesson.md"), "utf8");
const piCitation = [...parseHistory(piLesson).citations.values()][0];
const fixture = `Foresight-history-${Date.now()}.md`;
const external = fixture.replace(".md", "-external.md");
const moved = fixture.replace(".md", "-moved.md");
const movedArchiveId = "fb99b204-a443-43e0-9b78-0c5aafaca3f2";
const checks = [];
const report = { passed: false, appVersion: obsidian("version"), model: "glm-5.3", checks, before: { notebook: hash(notebookPath), archive: hash(archivePath) } };
let initialSettings;
const owned = [];
let initialLeaves;
let initialActive;
let lastPointer;

function check(name, value) { assert.ok(value, name); checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
function waitFor(code, timeout = 8000) {
  return evaluate(`const deadline=Date.now()+${timeout};while(Date.now()<deadline){const value=await(async()=>{${code}})();if(value)return value;await new Promise(r=>setTimeout(r,60));}throw new Error("等待界面超时");`);
}
function ref(id, value = quiz, version = 1) {
  return `[^${id}]: [回顾·${id.replace(/^history-/, "")}](<${value.archive_uri}#mdlog-${value.event_ids[0]}>) <!-- history-ref:v${version} ${JSON.stringify(value)} -->`;
}
function screenshot(name) { obsidian("dev:screenshot", `path=${join(results, name).replaceAll("\\", "/")}`); }
function cdp(method, params) { if (method === "Input.dispatchMouseEvent" && params.type === "mouseMoved") lastPointer = params; return obsidian("dev:cdp", `method=${method}`, `params=${JSON.stringify(params)}`); }
function active(variable = "__historyLeaf") { evaluate(`app.workspace.setActiveLeaf(window.${variable},{focus:true});return true;`); }
function mode(type, path = fixture) {
  evaluate(`await window.__historyLeaf.setViewState({type:"markdown",state:{file:${JSON.stringify(path)},mode:${JSON.stringify(type === "preview" ? "preview" : "source")},source:${type === "source"}}});app.workspace.setActiveLeaf(window.__historyLeaf,{focus:true});if(${type !== "preview"}){window.__historyLeaf.view.editor.setCursor({line:0,ch:0});window.__historyLeaf.view.editor.scrollIntoView({from:{line:0,ch:0},to:{line:8,ch:0}},true);}return true;`);
}
function buttons() { return evaluate(`return [...window.__historyLeaf.view.containerEl.querySelectorAll(".foresight-history-reference")].filter(b=>b.getBoundingClientRect().width).map(b=>b.dataset.historyId);`); }
function input(id, clicking = false, ctrl = false) {
  return waitFor(`
    const view=window.__historyLeaf.view;
    const feature=app.plugins.plugins.foresight._children.find(c=>c.ui);
    const source=await feature.documents.read(view.file);
    const text=source.text;
    const occurrence=source.document.occurrences.find(o=>o.citation.id===${JSON.stringify(id)});
    if(!occurrence)return false;
    const line=text.slice(0,occurrence.from).split(${JSON.stringify("\n")}).length-1;
    if(view.getMode()==="preview"){
      if(!view.previewMode.renderer.applyScroll(line))return false;
    }else view.editor.scrollIntoView({from:{line,ch:0},to:{line,ch:0}},true);
    await new Promise(resolve=>setTimeout(resolve,150));
    const button=[...view.containerEl.querySelectorAll(".foresight-history-reference")].find(b=>b.dataset.historyId===${JSON.stringify(id)} && b.getBoundingClientRect().width);
    if(!button)return false;
    const r=button.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
    if(!button.isConnected || r.top<0 || r.bottom>innerHeight || document.elementFromPoint(x,y)?.closest(".foresight-history-reference")!==button)return false;
    // Measure and send native input in the same CLI evaluation. Separate CLI
    // round trips can let Obsidian restore a scroll position between the two.
    const debuggerApi=require("@electron/remote").getCurrentWebContents().debugger;
    await debuggerApi.sendCommand("Input.dispatchMouseEvent",{type:"mouseMoved",x,y});
    if(${clicking}){
      await debuggerApi.sendCommand("Input.dispatchMouseEvent",{type:"mousePressed",x,y,button:"left",clickCount:1,modifiers:${ctrl ? 2 : 0}});
      await debuggerApi.sendCommand("Input.dispatchMouseEvent",{type:"mouseReleased",x,y,button:"left",clickCount:1,modifiers:${ctrl ? 2 : 0}});
    }
    return {x,y};
  `);
}
function hover(id) {
  cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: 10, y: 40 });
  waitFor(`return !document.querySelector(".foresight-history-popover");`);
  lastPointer = input(id);
}
function click(id, ctrl = false) {
  cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: 10, y: 40 });
  waitFor(`return !document.querySelector(".foresight-history-popover");`);
  lastPointer = input(id, true, ctrl);
}
function top() {
  active();
  evaluate(`window.__historyLeaf.view.setEphemeralState({line:0});return true;`);
  waitFor(`return window.__historyLeaf.view.previewMode.getScroll()<2;`);
}
function quizPopup() { return waitFor(`const p=document.querySelector(".foresight-history-popover");return p?.textContent.includes("Your answer: 2.") && p.textContent.includes("路线 A") && p.querySelectorAll(".foresight-history-event").length===2;`); }

try {
  initialSettings = evaluate(`const p=app.plugins.plugins.foresight;if(!p)throw new Error("Foresight 未加载");window.__historyInitialActive=app.workspace.activeLeaf;window.__historyInitialLeaves=app.workspace.getLeavesOfType("markdown").map(l=>({id:l.id,state:l.getViewState(),scroll:l.view.currentMode.getScroll()}));return JSON.parse(JSON.stringify(p.settings));`);
  initialActive = evaluate("return window.__historyInitialActive.id;");
  initialLeaves = evaluate("return window.__historyInitialLeaves;");
  // Windows may report a covered application as hidden and suspend rendering.
  // Exercise the actual Electron renderer through the official CLI/CDP API.
  cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
  const book = parseCitations(notebook).occurrences[0].citation;
  const textbook = `[^book-coexist]: [原书·交互图](<${book.reference.source_uri}#page=${book.reference.pdf_page}>) <!-- textbook-ref:v1 ${JSON.stringify(book.reference)} -->`;
  const content = [
    "# 学习回顾：真实转录验收", "", piLesson.trim(), "",
    "先前的两步比较按整轮求和，A 得 −1、B 得 2，因此选 B。[^history-quiz] 现在只评价未来奖励。", "",
    "整轮累计奖励的原讲解[^history-knowledge]，Python 代码片段[^history-code]，原书交互图[^book-coexist]，个人脚注[^personal]。", "",
    "> [!note] 回顾练习", "> callout 中的问答[^history-callout]。", ">", "> " + ref("history-callout"), "",
    "缺失记录[^history-missing]，错误课程[^history-wrong]，未知版本[^history-unknown]。", "",
    ref("history-quiz"), ref("history-knowledge", knowledgeRef), ref("history-code", codeRef),
    ref("history-missing", { ...quiz, event_ids: ["0".repeat(64)] }), ref("history-wrong", { ...quiz, archive_id: "00000000-0000-0000-0000-000000000000" }), ref("history-unknown", quiz, 2),
    textbook, "[^personal]: 普通个人脚注。", "",
    "```markdown", "代码示例[^history-example]", ref("history-example"), "```", "",
    "## 原始历史记录（测试副本）", "", notebook
  ].join("\n");
  const parsed = parseHistory(content);
  const quizTarget = historyPosition(content, locateHistory(parsed, quiz)[0]).line;
  evaluate(`const p=app.plugins.plugins.foresight;p.settings.historyReferences.enabled=true;p.settings.textbookReferences.enabled=true;await p.saveSettings();window.__historyFixture=await app.vault.create(${JSON.stringify(fixture)},${JSON.stringify(content)});window.__historyLeaf=app.workspace.getLeaf("tab");await window.__historyLeaf.openFile(window.__historyFixture);app.workspace.setActiveLeaf(window.__historyLeaf,{focus:true});return true;`);
  owned.push(fixture);
  mode("preview");
  waitFor(`return !!window.__historyLeaf.view.containerEl.querySelector(".foresight-history-reference");`);
  check("glm-5.3 实际输出在真实 Obsidian 中显示回顾标签", buttons().includes(piCitation.id));
  hover("history-quiz"); check("真实鼠标悬停展示原题、实际回答与解析", quizPopup());
  check("悬停内容中的 LaTeX 使用原生数学渲染", evaluate(`return !!document.querySelector(".foresight-history-popover .math mjx-container");`));
  check("回顾弹层与原书标签使用不同组件与样式", evaluate(`const p=document.querySelector(".foresight-history-popover");return getComputedStyle(p).flexDirection==="column" && !p.classList.contains("foresight-citation") && !!window.__historyLeaf.view.containerEl.querySelector(".foresight-citation");`));
  check("长问答弹层保持在窗口内并可滚动", waitFor(`const p=document.querySelector(".foresight-history-popover");if(!p)return false;const r=p.getBoundingClientRect();const c=p.querySelector(".foresight-history-content");return r.top>=0 && r.left>=0 && r.bottom<=innerHeight && r.right<=innerWidth && getComputedStyle(c).overflowY==="auto";`));
  screenshot("history-quiz-hover.png");
  cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: 10, y: 40 });
  check("鼠标移开后弹层关闭", waitFor(`return !document.querySelector(".foresight-history-popover");`));
  const leavesBefore = evaluate(`return app.workspace.getLeavesOfType("markdown").length;`);
  click("history-quiz");
  check("点击在当前阅读副本中精确跳到 quiz 事件，复用窗格", waitFor(`return app.workspace.activeLeaf===window.__historyLeaf && Math.abs(window.__historyLeaf.view.previewMode.getScroll()-${quizTarget})<2 && app.workspace.getLeavesOfType("markdown").length===${leavesBefore};`));
  screenshot("history-quiz-jump.png");
  top(); hover("history-quiz"); quizPopup();
  const answerButton = waitFor(`const button=document.querySelectorAll(".foresight-history-event .foresight-history-jump")[1];if(!button)return false;button.scrollIntoView({block:"nearest"});const r=button.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);
  cdp("Input.dispatchMouseEvent", { type: "mouseMoved", ...answerButton });
  cdp("Input.dispatchMouseEvent", { type: "mousePressed", ...answerButton, button: "left", clickCount: 1 });
  cdp("Input.dispatchMouseEvent", { type: "mouseReleased", ...answerButton, button: "left", clickCount: 1 });
  check("弹层中的回答按钮精确跳到实际回答事件", waitFor(`return app.workspace.activeLeaf===window.__historyLeaf && Math.abs(window.__historyLeaf.view.previewMode.getScroll()-${locateHistory(parsed, quiz)[1].line})<2;`));
  top(); hover("history-code");
  check("历史 Python 代码在弹层中按代码块显示", waitFor(`return !!document.querySelector(".foresight-history-popover pre code");`));
  screenshot("history-code-hover.png");
  top(); hover(piCitation.id); check("模型生成的标签悬停也能解析真实问答", quizPopup());
  check("普通脚注、未知版本与代码示例保留原显示", evaluate(`const c=window.__historyLeaf.view.containerEl;return !!c.querySelector("sup.footnote-ref") && ![...c.querySelectorAll(".foresight-history-reference")].some(b=>["history-unknown","history-example"].includes(b.dataset.historyId)) && c.querySelector("pre code").textContent.includes("[^history-example]");`));
  hover("history-missing");
  check("缺失事件悬停说明问题，不伪造预览", waitFor(`return document.querySelector(".foresight-history-popover")?.textContent.includes("缺失");`));
  const scrollBefore = evaluate("return window.__historyLeaf.view.previewMode.getScroll();");
  click("history-missing");
  check("缺失事件点击提示且不误跳", waitFor(`return [...document.querySelectorAll(".notice")].some(n=>n.textContent.includes("缺失")) && window.__historyLeaf.view.previewMode.getScroll()===${scrollBefore};`));
  hover("history-wrong");
  check("错误课程 UUID 不引用同名事件", waitFor(`return document.querySelector(".foresight-history-popover")?.textContent.includes("不匹配");`));

  mode("live");
  waitFor(`return !!window.__historyLeaf.view.editor.cm.contentDOM.querySelector(".foresight-history-reference");`);
  check("实时预览显示独立历史标签", buttons().includes("history-knowledge"));
  hover("history-callout"); check("实时预览 callout 正确关联原 ID 和完整问答", quizPopup());
  screenshot("history-live-preview.png");
  click("history-knowledge");
  check("实时预览点击精确选择被引原文", waitFor(`return window.__historyLeaf.view.editor.getSelection()===${JSON.stringify(knowledgeRef.quote)};`));
  // Insert text in the owned copy, then re-resolve the event instead of reusing a line number.
  evaluate(`await app.vault.modify(window.__historyFixture,${JSON.stringify("新增前言\n\n")}+window.__historyLeaf.view.editor.getValue());return true;`);
  mode("live");
  waitFor(`return window.__historyLeaf.view.editor.getValue().startsWith("新增前言");`);
  click("history-knowledge");
  check("转录前插文字后仍按事件 ID 和原文定位", waitFor(`return window.__historyLeaf.view.editor.getSelection()===${JSON.stringify(knowledgeRef.quote)};`));
  mode("live");
  const markerLine = evaluate(`return window.__historyLeaf.view.editor.getValue().split(${JSON.stringify("\n")}).findIndex(l=>l.includes("整轮累计奖励的原讲解"));`);
  evaluate(`window.__historyLeaf.view.editor.setCursor({line:${markerLine},ch:0});return true;`);
  check("光标进入标记行后可编辑原始 history 脚注", waitFor(`return window.__historyLeaf.view.editor.cm.contentDOM.textContent.includes("[^history-knowledge]");`));
  mode("source");
  check("源码模式不替换历史引用", waitFor(`return !window.__historyLeaf.view.editor.cm.contentDOM.querySelector(".foresight-history-reference");`));
  mode("preview");
  evaluate(`const p=app.plugins.plugins.foresight;p.settings.historyReferences.enabled=false;await p.saveSettings();app.workspace.updateOptions();window.__historyLeaf.view.previewMode.rerender(true);return true;`);
  check("历史功能可单独关闭，教材注解仍工作", waitFor(`const c=window.__historyLeaf.view.previewMode.containerEl;return !c.querySelector(".foresight-history-reference") && !!c.querySelector(".foresight-citation") && !!c.querySelector("sup.footnote-ref");`));
  evaluate(`const p=app.plugins.plugins.foresight;p.settings.historyReferences.enabled=true;p.settings.textbookReferences.enabled=false;await p.saveSettings();app.workspace.updateOptions();window.__historyLeaf.view.previewMode.rerender(true);return true;`);
  check("教材功能关闭后历史引用仍独立工作", waitFor(`const c=window.__historyLeaf.view.previewMode.containerEl;return !!c.querySelector(".foresight-history-reference") && !c.querySelector(".foresight-citation");`));
  hover("history-quiz"); quizPopup();
  obsidian("plugin:disable", "id=foresight");
  check("卸载插件清理悬停弹层并恢复原生脚注", waitFor(`const c=window.__historyLeaf.view.previewMode.containerEl;return !document.querySelector(".foresight-history-popover") && !c.querySelector(".foresight-history-reference") && !!c.querySelector("sup.footnote-ref");`));
  obsidian("plugin:enable", "id=foresight");
  check("重新加载插件恢复标签且不重复", waitFor(`return [...window.__historyLeaf.view.previewMode.containerEl.querySelectorAll(".foresight-history-reference")].filter(b=>b.dataset.historyId==="history-quiz" && b.getBoundingClientRect().width).length===1;`));

  const externalText = "# 外部引用\n\n回顾原题[^history-external]。\n\n" + ref("history-external", { ...quiz, archive_uri: pathToFileURL(archivePath).href });
  evaluate(`window.__historyExternal=await app.vault.create(${JSON.stringify(external)},${JSON.stringify(externalText)});window.__historyLeaf=app.workspace.getLeaf("tab");await window.__historyLeaf.openFile(window.__historyExternal);app.workspace.setActiveLeaf(window.__historyLeaf,{focus:true});return true;`);
  owned.push(external); mode("preview", external);
  hover("history-external"); check("单独笔记中的引用读取 vault 内原本", quizPopup());
  click("history-external");
  const sourceLine = locateHistory(parseHistory(readFileSync(archivePath, "utf8")), quiz)[0].line;
  check("跨文件点击准确打开真实 archive 的 quiz 位置", waitFor(`const v=app.workspace.activeLeaf.view;return v.file?.path==="curricula/deep-reinforcement-learning-hands-on/transcripts/archive.md" && (v.getMode()==="source"?v.editor.getCursor().line===${sourceLine}:Math.abs(v.previewMode.getScroll()-${sourceLine})<2);`));
  screenshot("history-archive-jump.png");

  const synthetic = `<!-- md-log:archive:${movedArchiveId} -->\n# 移动后的原本\n\n<!-- md-log:event:${quiz.event_ids[0]} -->\n> [!question] Quiz\n> 移动后的真实测试事件。\n\n`;
  evaluate(`window.__historyMoved=await app.vault.create(${JSON.stringify(moved)},${JSON.stringify(synthetic)});await app.vault.modify(window.__historyExternal,${JSON.stringify("# 移动引用\n\n原本已移动[^history-moved]。\n\n" + ref("history-moved", { archive_id: movedArchiveId, archive_uri: "file:///E:/old-vault/missing-archive.md", event_ids: [quiz.event_ids[0]] }))});window.__historyLeaf=app.workspace.getLeavesOfType("markdown").find(l=>l.view.file?.path===${JSON.stringify(external)});return true;`);
  owned.push(moved); mode("preview", external);
  hover("history-moved");
  check("原本移动后按转录 UUID 找到同一事件", waitFor(`return document.querySelector(".foresight-history-popover")?.textContent.includes("移动后的真实测试事件");`));
  click("history-moved");
  check("移动后的原本仍可精确跳转", waitFor(`return app.workspace.activeLeaf.view.file?.path===${JSON.stringify(moved)} && app.workspace.activeLeaf.view.containerEl.textContent.includes("移动后的真实测试事件");`));
  report.passed = true;
} catch (error) {
  report.error = error.stack ?? String(error);
  try { report.ui = evaluate(`const v=window.__historyLeaf.view;const feature=app.plugins.plugins.foresight?._children.find(c=>c.ui);const p=feature?.ui.currentPopover;const pointer=${JSON.stringify(lastPointer ?? { x: 0, y: 0 })};return {visible:document.visibilityState,activeFile:app.workspace.activeLeaf?.view.file?.path,settings:app.plugins.plugins.foresight?.settings,hoverCalls:window.__historyHoverCalls,popover:p&&{state:p.state,connected:p.hoverEl.isConnected,targetConnected:p.targetEl?.isConnected,onTarget:p.onTarget,onHover:p.onHover,shown:feature.ui.hoverPopover===p,text:p.hoverEl.textContent},pointer,hit:document.elementFromPoint(pointer.x,pointer.y)?.outerHTML.slice(0,700),citations:feature&&[...feature.documents.parse(v.file.path,v.editor.getValue()).citations.keys()],nativeRefs:[...v.previewMode.containerEl.querySelectorAll("sup.footnote-ref a")].slice(0,12).map(a=>({id:a.dataset.footref,text:a.textContent})),buttons:[...v.containerEl.querySelectorAll(".foresight-history-reference")].map(b=>({id:b.dataset.historyId,rect:b.getBoundingClientRect().toJSON()}))};`); } catch { /* Preserve original failure. */ }
  try { screenshot("history-failure.png"); } catch { /* Preserve original failure. */ }
  process.exitCode = 1;
  console.error(error);
} finally {
  const cleanupErrors = [];
  const cleanup = (code) => { try { evaluate(code); } catch (error) { cleanupErrors.push(error.message); } };
  cleanup(`if(!app.plugins.plugins.foresight)await app.plugins.enablePluginAndSave("foresight");const p=app.plugins.plugins.foresight;Object.assign(p.settings,${JSON.stringify(initialSettings ?? {})});await p.saveSettings();return true;`);
  cleanup(`for(const leaf of app.workspace.getLeavesOfType("markdown")){if(${JSON.stringify(owned)}.includes(leaf.view.file?.path)||!${JSON.stringify(initialLeaves?.map((leaf) => leaf.id) ?? [])}.includes(leaf.id))leaf.detach();}for(const path of ${JSON.stringify(owned)}){const file=app.vault.getFileByPath(path);if(file)await app.vault.delete(file);}for(const saved of ${JSON.stringify(initialLeaves ?? [])}){const leaf=app.workspace.getLeafById(saved.id);if(leaf){await leaf.setViewState(saved.state);if(Number.isFinite(saved.scroll))leaf.view.setEphemeralState({scroll:saved.scroll});}}const leaf=app.workspace.getLeafById(${JSON.stringify(initialActive ?? "")});if(leaf)app.workspace.setActiveLeaf(leaf,{focus:true});delete window.__historyLeaf;delete window.__historyFixture;delete window.__historyExternal;delete window.__historyMoved;delete window.__historyInitialActive;delete window.__historyInitialLeaves;return true;`);
  try { cdp("Emulation.setFocusEmulationEnabled", { enabled: false }); } catch (error) { cleanupErrors.push(error.message); }
  report.after = { notebook: hash(notebookPath), archive: hash(archivePath) };
  check("真实 Notebook.md 与 archive.md 的 SHA-256 均未改变", JSON.stringify(report.before) === JSON.stringify(report.after));
  if (cleanupErrors.length) { report.cleanupErrors = cleanupErrors; report.passed = false; process.exitCode = 1; }
  writeFileSync(join(results, "obsidian-history-smoke.json"), JSON.stringify(report, null, 2));
  console.log(`Report: ${join(results, "obsidian-history-smoke.json")}`);
}
