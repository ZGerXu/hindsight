import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { digest, learningRoot } from "./archive.mjs";
import { userBlock, stripSkillBlocks, assistantBlock, questionCallout, answerCalloutQuiz, answerCalloutAsk } from "./format.mjs";

export const QA_TOOLS = new Set(["quiz", "ask_user_question"]);

// Apply presentation rewrites without changing code examples or citation metadata.
function rewriteProse(text, rewrite) {
	let fence = null;
	let comment = false;
	return text.split(/(?<=\n)/).map((line) => {
		// Include blockquote prefixes used by Q&A callouts; a shorter nested fence
		// cannot close a longer code fence. Preserve even an unfinished code block.
		const marker = line.replace(/^(?:[ \t]*>[ \t]?)+/, "").trimEnd().match(/^[ \t]*(`{3,}|~{3,})(.*)$/);
		if (fence) {
			if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
			return line;
		}
		if (!comment && marker) { fence = marker[1]; return line; }
		let prefix = "";
		if (comment) {
			const end = line.indexOf("-->");
			if (end < 0) return line;
			prefix = line.slice(0, end + 3);
			line = line.slice(end + 3);
			comment = false;
		}
		return prefix + line.split(/(`+[^`\n]*`+|<!--.*?(?:-->|(?=\r?\n?$)))/g).map((part, index) => {
			if (index % 2) {
				if (part.startsWith("<!--") && !part.endsWith("-->")) comment = true;
				return part;
			}
			return rewrite(part);
		}).join("");
	}).join("");
}

// Make lesson assets readable even when the mirror is outside the project vault.
// Leave fenced/inline code untouched. Unknown wiki targets retain their original syntax.
export function portableLinks(text, cwd) {
	const absolute = (target) => {
		if (!path.isAbsolute(target) && /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) return target;
		const [file, fragment] = target.split(/#(.*)/s);
		let decoded = file;
		try { decoded = decodeURI(file); } catch { /* A literal % is valid in a local filename. */ }
		return pathToFileURL(path.resolve(cwd, decoded)).href + (fragment === undefined ? "" : `#${fragment}`);
	};
	return rewriteProse(text, (part) => part
			.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, file, label) => {
				const candidates = [path.resolve(cwd, file), path.resolve(cwd, "viz", file), path.resolve(learningRoot(cwd), "viz", file)];
				const asset = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
				return asset ? `![${label ?? path.basename(file)}](<${pathToFileURL(asset).href}>)` : match;
			})
			.replace(/(!?\[[^\]\n]*\])\((<[^>\n]+>|[^\s()]+)(\s+"[^"\n]*")?\)/g,
				(_match, label, target, title = "") => {
					const url = absolute(target.startsWith("<") ? target.slice(1, -1) : target);
					return `${label}(${url.startsWith("file:") ? `<${url}>` : url}${title})`;
			}));
}

export function record(key, text, cwd) {
	const id = digest(key);
	const scoped = rewriteProse(text, (part) => part.replace(/\[\^book-([a-z0-9][a-z0-9-]*)\]/g,
		(match, label) => label.startsWith(`${id}-`) ? match : `[^book-${id}-${label}]`));
	return { id, text: portableLinks(scoped, cwd) };
}

export function messageRecord(message, cwd) {
	if (message?.role !== "user" && message?.role !== "assistant") return [];
	const text = typeof message.content === "string" ? message.content : (message.content ?? [])
		.filter((part) => part.type === "text").map((part) => part.text).join("\n\n");
	const visible = message.role === "user" ? stripSkillBlocks(text.trim()) : text.trim();
	if (!visible) return [];
	// message_end fires before SessionManager assigns an entry ID. The persisted
	// timestamp and reading text give live events and later branch replay the same ID.
	return [record(JSON.stringify([message.role, message.timestamp, visible]),
		message.role === "user" ? userBlock(visible) : assistantBlock(visible), cwd)];
}

export function questionRecord(toolCallId, name, input, displayedOptions, cwd) {
	const options = name === "quiz" ? displayedOptions : input.options;
	const context = [input.details?.trim(), name === "quiz" && !displayedOptions?.length
		? "Display order was not recorded; option numbers are unavailable." : null].filter(Boolean).join("\n\n");
	return record(`question:${toolCallId}`, questionCallout(name === "quiz" ? "Quiz" : "Question",
		input.question ?? "", context || undefined, options ?? []), cwd);
}

export function answerRecord(toolCallId, name, details, cwd, isError = false) {
	const body = isError || !details
		? "> [!warning] Question — no assessment result\n> The tool failed or returned no readable result."
		: name === "quiz" ? answerCalloutQuiz(details) : answerCalloutAsk(details);
	return record(`answer:${toolCallId}`, body, cwd);
}

export function branchRecords(entries, cwd) {
	const results = new Map(entries.filter((entry) => entry.type === "message" && entry.message?.role === "toolResult")
		.map((entry) => [entry.message.toolCallId, entry.message]));
	const records = [];
	for (const entry of entries) {
		if (entry.type !== "message") continue;
		const message = entry.message;
		records.push(...messageRecord(message, cwd));
		if (message.role === "assistant") {
			for (const call of message.content ?? []) {
				if (call.type !== "toolCall" || !QA_TOOLS.has(call.name)) continue;
				const displayed = results.get(call.id)?.details?.options;
				// Pending quiz display order exists only in tool_execution_update.
				// Do not commit a guessed question that would hide the real live order.
				if (call.name === "quiz" && !results.has(call.id)) continue;
				records.push(questionRecord(call.id, call.name, call.arguments ?? {}, displayed, cwd));
			}
		} else if (message.role === "toolResult" && QA_TOOLS.has(message.toolName)) {
			records.push(answerRecord(message.toolCallId, message.toolName, message.details, cwd, message.isError));
		}
	}
	return records;
}
