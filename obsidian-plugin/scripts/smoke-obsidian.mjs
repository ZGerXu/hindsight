import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCitations } from "../src/features/textbook-references/parser.ts";
import { evaluate, obsidian } from "./obsidian-cli.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const results = join(root, "test-results");
mkdirSync(results, { recursive: true });
const archive = "curricula/deep-reinforcement-learning-hands-on/transcripts/archive.md";
const archivePath = join(root, "../..", archive);
const archiveBytes = readFileSync(archivePath);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const citations = parseCitations(archiveBytes.toString("utf8"));
const figure = [...citations.citations.values()].find((citation) => citation.reference.locator?.startsWith("Figure "));
assert.ok(figure, "真实转录应包含图号引用");
const checks = [];
const report = { appVersion: obsidian("version"), checks, sourceHashBefore: digest(archiveBytes) };
const fixture = `Foresight-Smoke-${Date.now()}.md`;
let fixtureCreated = false;
let initialSettings;

function check(name, value) { assert.ok(value, name); checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
function waitFor(code, timeout = 10000) {
  return evaluate(`const deadline=Date.now()+${timeout};while(Date.now()<deadline){const result=await(async()=>{${code}})();if(result)return result;await new Promise(resolve=>setTimeout(resolve,60));}throw new Error("等待界面超时");`);
}
function screenshot(name) { obsidian("dev:screenshot", `path=${join(results, name).replaceAll("\\", "/")}`); }
function reference(id, overrides = {}, version = "1") {
  const base = figure.reference;
  const ref = { source_sha256: base.source_sha256, source_uri: base.source_uri, pdf_page: base.pdf_page, ...overrides };
  return `[^${id}]: [原书·${id}](<${ref.source_uri}#page=${ref.pdf_page}>) <!-- textbook-ref:v${version} ${JSON.stringify(ref)} -->`;
}
function previewButtons() {
  return evaluate(`return [...window.__foresightSmokeLeaf.view.previewMode.containerEl.querySelectorAll(".foresight-citation")].map(button=>({key:button.dataset.citationKey,page:Number(button.dataset.pdfPage),label:button.textContent}));`);
}
function scroll(line) {
  // applyScroll can return false while Obsidian is still computing section heights.
  // Retry that operation itself; a long note can also clamp its final scroll position.
  waitFor(`return window.__foresightSmokeLeaf.view.previewMode.renderer.applyScroll(${line});`);
  evaluate("await new Promise(resolve=>setTimeout(resolve,100));return true;");
}
function click(key, mode = "preview", modifier = false) {
  return waitFor(`const view=window.__foresightSmokeLeaf.view;const container=${mode === "preview" ? "view.previewMode.containerEl" : "view.editor.cm.contentDOM"};const button=[...container.querySelectorAll(".foresight-citation")].find(button=>button.dataset.citationKey===${JSON.stringify(key)});if(!button)return false;button.dispatchEvent(new MouseEvent("click",{bubbles:true,ctrlKey:${modifier}}));return true;`);
}
function highlight(page) {
  return waitFor(`const leaf=app.workspace.getLeavesOfType("pdf").find(leaf=>leaf.getViewState().state?.file==="Deep Reinforcement Learning Hands-On.pdf");const child=leaf?.view.viewer?.child;const target=child?.subpathHighlight;if(target?.type==="text"&&target.page===${page})return {target,pages:child.pdfViewer.pdfDocument.numPages};return null;`);
}

try {
  obsidian("dev:cdp", "method=Emulation.setFocusEmulationEnabled", 'params={"enabled":true}');
  evaluate(`for(const modal of document.querySelectorAll(".modal-content")){if(modal.querySelector("h2")?.textContent!=="原书·book-agent")continue;const button=[...modal.querySelectorAll("button")].find(button=>button.textContent==="在 Obsidian 中打开原文");button?.click();}return true;`);
  initialSettings = evaluate(`const plugin=app.plugins.plugins["foresight"];if(!plugin)throw new Error("插件未加载");return JSON.parse(JSON.stringify(plugin.settings));`);
  check("插件已在真实 Obsidian 中加载", true);
  evaluate(`const plugin=app.plugins.plugins["foresight"];plugin.settings.textbookReferences.enabled=true;plugin.settings.textbookReferences.openInSplit=true;await plugin.saveSettings();const file=app.vault.getFileByPath(${JSON.stringify(archive)});window.__foresightSmokeLeaf=app.workspace.getLeavesOfType("markdown").find(leaf=>leaf.view.file?.path===file.path)??app.workspace.getLeaf("tab");await window.__foresightSmokeLeaf.openFile(file);await window.__foresightSmokeLeaf.setViewState({type:"markdown",state:{file:file.path,mode:"preview"}});app.workspace.setActiveLeaf(window.__foresightSmokeLeaf,{focus:true});window.__foresightSmokeLeaf.view.previewMode.rerender(true);window.__foresightSmokeLeaf.view.previewMode.applyScroll(180);return true;`);
  const observed = new Map();
  for (const line of [...new Set(citations.occurrences.map((occurrence) => archiveBytes.toString("utf8").slice(0, occurrence.from).split("\n").length - 1))]) {
    scroll(line);
    for (const button of previewButtons()) observed.set(button.key, button);
  }
  for (const occurrence of citations.occurrences) assert.equal(observed.get(occurrence.citation.key)?.page, occurrence.citation.reference.pdf_page, occurrence.citation.label);
  check(`真实转录中的 ${citations.occurrences.length} 个引用均显示且定位一致`, true);
  report.renderedCitations = [...observed.values()];
  scroll(203);
  const agent = [...citations.citations.values()].find((citation) => citation.label === "原书·agent 定义");
  waitFor(`return [...window.__foresightSmokeLeaf.view.previewMode.containerEl.querySelectorAll(".foresight-citation")].some(button=>button.dataset.citationKey===${JSON.stringify(agent.key)});`);
  click(agent.key);
  report.agentHighlight = highlight(35);
  check("点击真实转录可在原生 PDF 阅读器中高亮 agent 原文", report.agentHighlight.pages === 827);
  screenshot("archive-pdf-quote.png");
  const communication = [...citations.citations.values()].find((citation) => citation.reference.pdf_page === 36 && citation.label.includes("environment"));
  click(communication.key);
  report.communicationHighlight = highlight(36);
  const figureOccurrence = citations.occurrences.find((occurrence) => occurrence.citation.key === figure.key);
  scroll(archiveBytes.toString("utf8").slice(0, figureOccurrence.from).split("\n").length - 1);
  waitFor(`return [...window.__foresightSmokeLeaf.view.previewMode.containerEl.querySelectorAll(".foresight-citation")].some(button=>button.dataset.citationKey===${JSON.stringify(figure.key)});`);
  click(figure.key);
  report.figureHighlight = highlight(figure.reference.pdf_page);
  check(`图号引用定位并高亮 ${figure.reference.locator}`, true);
  check("连续点击复用同一原书 PDF 窗格", evaluate(`return app.workspace.getLeavesOfType("pdf").filter(leaf=>leaf.getViewState().state?.file==="Deep Reinforcement Learning Hands-On.pdf").length;`) === 1);

  const fixtureSource = [
    "# 教材引用集成测试", "", "个人脚注[^personal] 与行内脚注^[个人行内记录]。教材[^book-figure]。", "",
    "[^personal]: 个人脚注仍应显示。", "", reference("book-figure", { ...figure.reference }), "",
    "> [!success] Quiz", "> callout 内的 agent 定义[^book-agent]。", ">", "> " + reference("book-agent", { ...agent.reference }), "",
    "未知版本[^book-unknown]，格式错误[^book-invalid]，错误版本教材[^book-wrong]，页级引用[^book-page]，旧位置教材[^book-moved]。", "",
    reference("book-unknown", {}, "2"), reference("book-invalid").replace(`"pdf_page":${figure.reference.pdf_page}`, '"pdf_page":0'),
    reference("book-wrong", { source_sha256: "0".repeat(64) }), reference("book-page", { pdf_page: 32, locator: undefined, quote: undefined }),
    reference("book-moved", { ...agent.reference, source_uri: "file:///E:/old-location/Moved%20Book.pdf" }), "",
    "代码示例：", "```markdown", "示例[^book-figure] [注1]", reference("book-code"), "```", "",
    `<!-- md-log:event:${"1".repeat(64)} -->`, "", "转义标记 \\[注1]，第一条历史引用[注1]。", "", reference("book-legacy", { pdf_page: 29 }).replaceAll("[^book-legacy]", "[注1]"), "",
    `<!-- md-log:event:${"2".repeat(64)} -->`, "", "第二条历史引用[注1]。", "", reference("book-legacy", { pdf_page: 37 }).replaceAll("[^book-legacy]", "[注1]")
  ].join("\n");
  fixtureCreated = true;
  evaluate(`app.workspace.setActiveLeaf(window.__foresightSmokeLeaf,{focus:true});window.__foresightSmokeFixture=await app.vault.create(${JSON.stringify(fixture)},${JSON.stringify(fixtureSource)});window.__foresightSmokeFixtureLeaf=app.workspace.getLeaf("tab");window.__foresightSmokeLeaf=window.__foresightSmokeFixtureLeaf;await window.__foresightSmokeLeaf.openFile(window.__foresightSmokeFixture);await window.__foresightSmokeLeaf.setViewState({type:"markdown",state:{file:${JSON.stringify(fixture)},mode:"preview"}});await app.workspace.revealLeaf(window.__foresightSmokeLeaf);app.workspace.setActiveLeaf(window.__foresightSmokeLeaf,{focus:true});return true;`);
  waitFor(`return !!window.__foresightSmokeLeaf.view.previewMode.containerEl.querySelector(".foresight-citation");`);
  const fixtureButtons = previewButtons();
  check("普通脚注与行内脚注不影响原书标签定位", fixtureButtons.find((button) => button.key === "book-figure")?.page === figure.reference.pdf_page);
  check("未知版本和错误页码保持普通脚注显示", !fixtureButtons.some((button) => ["book-unknown", "book-invalid", "book-code"].includes(button.key)));
  check("代码示例未被替换", evaluate(`return window.__foresightSmokeLeaf.view.previewMode.containerEl.querySelector("pre code").textContent.includes("[^book-figure]");`));
  check("重名历史标记按事件绑定到不同页", fixtureButtons.filter((button) => button.key.endsWith(":注1")).map((button) => button.page).join(",") === "29,37");
  click("book-moved");
  highlight(35);
  check("教材 URI 失效时可按指纹找到 vault 中的原书", true);
  const before = evaluate(`return app.workspace.getLeavesOfType("pdf").length;`);
  click("book-wrong");
  waitFor(`return [...document.querySelectorAll(".notice")].some(notice=>notice.textContent.includes("未找到同版本教材"));`);
  check("教材指纹不匹配时不跳转到错误版本", evaluate(`return app.workspace.getLeavesOfType("pdf").length;`) === before);
  click("book-page");
  check("仅页码引用使用物理页而非印刷页", waitFor(`const child=app.workspace.getLeavesOfType("pdf")[0]?.view.viewer?.child;const subpath=child?.pdfViewer.subpath;if(typeof subpath!=="string" || !subpath.startsWith("["))return false;const destination=JSON.parse(subpath);return destination[0]===31 && !child.subpathHighlight;`));

  evaluate(`const leaf=window.__foresightSmokeLeaf;await leaf.setViewState({type:"markdown",state:{file:${JSON.stringify(fixture)},mode:"source",source:false}});leaf.view.editor.setCursor({line:0,ch:0});leaf.view.editor.scrollIntoView({from:{line:0,ch:0},to:{line:15,ch:0}},true);return true;`);
  waitFor(`return !!window.__foresightSmokeLeaf.view.editor.cm.contentDOM.querySelector(".foresight-citation");`);
  const liveButtons = evaluate(`return [...window.__foresightSmokeLeaf.view.editor.cm.contentDOM.querySelectorAll(".foresight-citation")].map(button=>({key:button.dataset.citationKey,page:Number(button.dataset.pdfPage)}));`);
  check("实时预览 callout 读取原始 ID，忽略局部脚注编号", liveButtons.find((button) => button.key === "book-agent")?.page === 35);
  click("book-agent", "live");
  highlight(35);
  check("实时预览按钮可定位原书短引文", true);
  evaluate(`window.__foresightSmokeLeaf.view.editor.setCursor({line:2,ch:0});return true;`);
  check("光标进入标记行后可编辑原始脚注", waitFor(`return window.__foresightSmokeLeaf.view.editor.cm.contentDOM.textContent.includes("[^book-figure]");`));
  evaluate(`const leaf=window.__foresightSmokeLeaf;await leaf.setViewState({type:"markdown",state:{file:${JSON.stringify(fixture)},mode:"source",source:true}});return true;`);
  check("源码模式保留原始 Markdown", waitFor(`return window.__foresightSmokeLeaf.view.editor.cm.contentDOM.querySelectorAll(".foresight-citation").length===0;`));
  evaluate(`const plugin=app.plugins.plugins["foresight"];plugin.settings.textbookReferences.enabled=false;await plugin.saveSettings();const leaf=window.__foresightSmokeLeaf;await leaf.setViewState({type:"markdown",state:{file:${JSON.stringify(fixture)},mode:"preview"}});leaf.view.previewMode.rerender(true);return true;`);
  check("关闭功能后恢复普通引用显示", waitFor(`return window.__foresightSmokeLeaf.view.previewMode.containerEl.querySelectorAll(".foresight-citation").length===0 && !!window.__foresightSmokeLeaf.view.previewMode.containerEl.querySelector("sup.footnote-ref");`));
  evaluate(`const plugin=app.plugins.plugins["foresight"];plugin.settings.textbookReferences.enabled=true;await plugin.saveSettings();window.__foresightSmokeLeaf.view.previewMode.rerender(true);return true;`);
  waitFor(`return !!window.__foresightSmokeLeaf.view.previewMode.containerEl.querySelector(".foresight-citation");`);
  evaluate(`const button=[...window.__foresightSmokeLeaf.view.previewMode.containerEl.querySelectorAll(".foresight-citation")].find(button=>button.dataset.citationKey==="book-agent");button.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:600,clientY:300}));return true;`);
  evaluate(`const item=[...document.querySelectorAll(".menu-item")].find(item=>item.textContent.includes("查看引用详情"));if(!item)throw new Error("引用菜单未打开");item.click();return true;`);
  check("右键详情包含原文锚点与物理页码", waitFor(`window.__foresightSmokeDetails=[...document.querySelectorAll(".modal-content")].at(-1);return window.__foresightSmokeDetails?.textContent.includes(${JSON.stringify(agent.reference.quote)}) && window.__foresightSmokeDetails?.textContent.includes("PDF 第 35 页");`));
  screenshot("citation-details.png");
  evaluate(`const button=[...window.__foresightSmokeDetails.querySelectorAll("button")].find(button=>button.textContent==="在 Obsidian 中打开原文");if(!button)throw new Error("详情中的原文按钮不存在");button.click();return true;`);
  check("详情组件的打开原文按钮可关闭对话框并定位 PDF", waitFor(`return !window.__foresightSmokeDetails.isConnected;`) && highlight(35));
  obsidian("plugin:disable", "id=foresight");
  check("卸载功能模块后恢复原生脚注显示", waitFor(`const container=window.__foresightSmokeLeaf.view.previewMode.containerEl;return !container.querySelector(".foresight-citation") && !!container.querySelector("sup.footnote-ref");`));
  obsidian("plugin:enable", "id=foresight");
  check("重新加载插件后恢复注解且没有重复组件", waitFor(`const buttons=[...window.__foresightSmokeLeaf.view.previewMode.containerEl.querySelectorAll(".foresight-citation")].filter(button=>button.dataset.citationKey==="book-agent");return buttons.length===1;`));
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = error.stack ?? String(error);
  try { screenshot("failure.png"); } catch { /* Keep the original failure. */ }
  throw error;
} finally {
  const cleanupErrors = [];
  const cleanup = (code) => { try { evaluate(code); } catch (error) { cleanupErrors.push(error.message); } };
  cleanup(`if(window.__foresightSmokeDetails?.isConnected){const button=[...window.__foresightSmokeDetails.querySelectorAll("button")].find(button=>button.textContent==="在 Obsidian 中打开原文");button?.click();}delete window.__foresightSmokeDetails;return true;`);
  if (fixtureCreated) cleanup(`window.__foresightSmokeFixtureLeaf?.detach();const owned=window.__foresightSmokeFixture;const file=app.vault.getFileByPath(${JSON.stringify(fixture)});if(owned?.path===${JSON.stringify(fixture)} && file===owned)await app.vault.delete(file);delete window.__foresightSmokeFixture;delete window.__foresightSmokeFixtureLeaf;return true;`);
  if (initialSettings) cleanup(`if(!app.plugins.plugins["foresight"])await app.plugins.enablePluginAndSave("foresight");const plugin=app.plugins.plugins["foresight"];Object.assign(plugin.settings,${JSON.stringify(initialSettings)});await plugin.saveSettings();app.workspace.updateOptions();return true;`);
  report.sourceHashAfter = digest(readFileSync(archivePath));
  check("真实 archive.md 的内容未被改写", report.sourceHashBefore === report.sourceHashAfter);
  const leafSetup = `const file=app.vault.getFileByPath(${JSON.stringify(archive)});window.__foresightSmokeLeaf=app.workspace.getLeavesOfType("markdown").find(leaf=>leaf.view.file?.path===file.path)??app.workspace.getLeaf("tab");await window.__foresightSmokeLeaf.openFile(file);await window.__foresightSmokeLeaf.setViewState({type:"markdown",state:{file:file.path,mode:"preview"}});window.__foresightSmokeLeaf.view.previewMode.applyScroll(203);return true;`;
  cleanup(leafSetup);
  try { obsidian("dev:cdp", "method=Emulation.setFocusEmulationEnabled", 'params={"enabled":false}'); } catch (error) { cleanupErrors.push(error.message); }
  if (cleanupErrors.length) { report.cleanupErrors = cleanupErrors; report.passed = false; }
  writeFileSync(join(results, "obsidian-smoke.json"), JSON.stringify(report, null, 2));
  console.log(`Report: ${join(results, "obsidian-smoke.json")}`);
}
if (!report.passed) process.exitCode = 1;
