/**
 * md-log — durable course transcripts and a user-selected Markdown mirror.
 * The curriculum skill binds the course before teaching. Reading events commit
 * to curricula/<course>/transcripts/archive.md first, then update the mirror.
 * /md-log backfills the entire archive; /md-unlog only detaches the mirror.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { TranscriptArchive, learningRoot, mirrorTarget } from "./md-log/archive.mjs";
import { QA_TOOLS, record, messageRecord, questionRecord, answerRecord, branchRecords } from "./md-log/records.mjs";
import { findHistory } from "./md-log/history.mjs";

type Binding = { directory: string; startEntryId: string | null };

export default function mdLog(pi: ExtensionAPI) {
	let archive: TranscriptArchive | null = null;
	let binding: Binding | null = null;
	let lastError: string | null = null;
	let pendingRecords: any[] = [];

	function report(ctx: any, error: unknown) {
		const message = String(error instanceof Error ? error.message : error);
		if (message !== lastError) ctx.ui.notify(`md-log: ${message}`, "error");
		lastError = message;
		ctx.ui.setStatus("md-log", "🗒 transcript needs attention");
	}

	function status(ctx: any) {
		lastError = null;
		ctx.ui.setStatus("md-log", archive
			? `🗒 ${binding ? "course auto-recording" : "session recording"}${archive.state.mirror ? ` → ${path.basename(archive.state.mirror)}` : ""}`
			: undefined);
	}

	function openCourse(directory: string) {
		if (!fs.statSync(path.join(directory, "course.md")).isFile()) throw new Error("Create course.md before binding its transcript.");
		return new TranscriptArchive(path.join(directory, "transcripts"), `${path.basename(directory)} · 学习转录`);
	}

	function replay(ctx: any) {
		if (!archive) return;
		archive.append(pendingRecords);
		pendingRecords = [];
		const branch = ctx.sessionManager.getBranch();
		const start = binding?.startEntryId ? branch.findIndex((entry: any) => entry.id === binding!.startEntryId) : 0;
		if (start < 0) throw new Error("Transcript boundary is missing from this branch; rebind the course before teaching.");
		const sessionId = ctx.sessionManager.getSessionId();
		archive.append([
			record(`session:${sessionId}:${binding?.startEntryId ?? "root"}`,
				`## 会话 ${ctx.sessionManager.getHeader()?.timestamp ?? sessionId}\n\n<!-- pi-session:${sessionId} -->`, ctx.cwd),
			...branchRecords(branch.slice(start), ctx.cwd),
		]);
	}

	function sync(ctx: any) {
		if (archive?.state.mirror) {
			const target = mirrorTarget(archive.state.mirror, ctx.cwd, binding?.directory);
			archive.sync(target, Boolean(binding));
		}
		status(ctx);
	}

	// Synchronous file operations keep source commits ordered across event handlers.
	// A failed mirror never undoes a successful source commit; replay/relink retries.
	function capture(ctx: any, records: any[]) {
		if (!archive) return;
		pendingRecords.push(...records);
		try {
			archive.append(pendingRecords);
			pendingRecords = [];
			sync(ctx);
		} catch (error) { report(ctx, error); }
	}

	function restore(ctx: any) {
		archive = null;
		binding = null;
		pendingRecords = [];
		ctx.ui.setStatus("md-log", undefined);
		try {
			const saved = ctx.sessionManager.getBranch().filter((entry: any) => entry.type === "custom" &&
				(entry.customType === "md-log-course" || entry.customType === "md-log")).at(-1);
			if (saved?.customType === "md-log-course" && saved.data?.directory) {
				binding = saved.data;
				archive = openCourse(binding!.directory);
			} else if (saved?.customType === "md-log" && saved.data?.file) {
				const directory = saved.data.archiveDir ?? path.join(learningRoot(ctx.cwd), "curricula", ".md-log", ctx.sessionManager.getSessionId());
				archive = new TranscriptArchive(directory, "会话转录");
				// Read old session-only bindings without overwriting their existing note.
				if (!saved.data.archiveDir) archive.link(mirrorTarget(saved.data.file, ctx.cwd, null));
			}
			replay(ctx);
			sync(ctx);
		} catch (error) { report(ctx, error); }
	}

	pi.on("session_start", async (_event, ctx) => { restore(ctx); });
	pi.on("session_tree", async (_event, ctx) => { restore(ctx); });
	pi.on("agent_end", async (_event, ctx) => {
		try { replay(ctx); sync(ctx); } catch (error) { report(ctx, error); }
	});

	pi.registerTool({
		name: "curriculum_history",
		label: "Course history",
		description: "Find recorded lesson/quiz evidence in the bound course before writing history-ref footnotes. Search with a specific phrase, then use the returned archive_id, archive_uri and exact event IDs. Includes a quiz's adjacent recorded question/answer; never returns an unrecorded answer key. Read-only; does not assess mastery.",
		parameters: {
			type: "object",
			properties: { query: { type: "string", description: "Specific phrase from the earlier lesson, question or feedback." } },
			required: ["query"], additionalProperties: false,
		} as any,
		async execute(_id: string, params: { query: string }) {
			try {
				if (!archive || !binding) throw new Error("Bind the course with curriculum_transcript first.");
				const result = { archive_uri: pathToFileURL(archive.file).href, ...findHistory(fs.readFileSync(archive.file, "utf8"), params.query) };
				return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
			} catch (error) {
				return { content: [{ type: "text", text: String(error) }], details: {}, isError: true };
			}
		},
	});

	pi.registerTool({
		name: "curriculum_transcript",
		label: "Curriculum transcript",
		description: "Bind the resolved course directory before curriculum planning/teaching/resuming. Automatically records reading content and restores its explicitly linked Markdown mirror. Use course_dir: null when leaving the course. history: branch imports the whole active branch ONLY when it is identified as this course's historical lesson; default current_turn avoids importing unrelated chat. Does not choose or link an external document.",
		parameters: {
			type: "object",
			properties: {
				course_dir: { anyOf: [{ type: "string" }, { type: "null" }], description: "Existing course directory containing course.md, or null to leave course mode." },
				history: { type: "string", enum: ["current_turn", "branch"] },
			},
			required: ["course_dir"],
			additionalProperties: false,
		} as any,
		async execute(_id: string, params: { course_dir: string | null; history?: string }, _signal: any, _update: any, ctx: any) {
			try {
				if (params.course_dir === null) {
					pi.appendEntry("md-log-course", { directory: null, startEntryId: null });
					archive = null;
					binding = null;
					pendingRecords = [];
					status(ctx);
					return { content: [{ type: "text", text: "Left course recording; the archive and mirror binding are retained for the next course session." }], details: {} };
				}
				if (archive) replay(ctx);
				const directory = fs.realpathSync(path.resolve(ctx.cwd, params.course_dir));
				const next = openCourse(directory);
				// A user may link a reading note before asking to start a curriculum.
				const prelinked = !binding ? archive?.state.mirror : null;
				const branch = ctx.sessionManager.getBranch();
				const startEntryId = params.history === "branch" ? null : binding?.directory === directory ? binding.startEntryId
					: branch.filter((entry: any) => entry.type === "message" && entry.message?.role === "user").at(-1)?.id ?? null;
				const nextBinding = { directory, startEntryId };
				pi.appendEntry("md-log-course", nextBinding);
				binding = nextBinding;
				archive = next;
				pendingRecords = [];
				replay(ctx);
				let mirrorError: string | null = null;
				try {
					if (prelinked && !archive.state.mirror) {
						archive.state.mirror = mirrorTarget(prelinked, ctx.cwd, directory);
						archive.saveState();
					}
					sync(ctx);
				} catch (error) {
					mirrorError = String(error instanceof Error ? error.message : error);
					report(ctx, error);
				}
				return {
					content: [{ type: "text", text: `Automatic transcript: ${archive.file}${mirrorError ? `\nMirror pending: ${mirrorError}` : ""}` }],
					details: { archive: archive.file, mirror: archive.state.mirror, mirrorError },
				};
			} catch (error) {
				report(ctx, error);
				return { content: [{ type: "text", text: `Transcript binding failed: ${String(error)}` }], details: {}, isError: true };
			}
		},
	});

	pi.on("message_end", async (event, ctx) => {
		capture(ctx, messageRecord(event.message, ctx.cwd));
	});

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "ask_user_question") return;
		capture(ctx, [questionRecord(event.toolCallId, event.toolName, event.input, undefined, ctx.cwd)]);
	});

	pi.on("tool_execution_update", async (event, ctx) => {
		if (event.toolName !== "quiz") return;
		const options = (event.partialResult as any)?.details?.options;
		if (!options?.length) return;
		capture(ctx, [questionRecord(event.toolCallId, event.toolName, event.args, options, ctx.cwd)]);
	});

	pi.on("tool_result", async (event, ctx) => {
		if (!QA_TOOLS.has(event.toolName)) return;
		capture(ctx, [answerRecord(event.toolCallId, event.toolName, event.details, ctx.cwd, event.isError)]);
	});

	pi.registerCommand("md-log", {
		description: "Link a Markdown reading document and sync the complete course transcript",
		handler: async (args, ctx) => {
			const filepath = args.trim().replace(/^"(.*)"$/, "$1");
			if (!filepath) { ctx.ui.notify("Usage: /md-log <existing-file.md>", "warning"); return; }
			if (!ctx.isIdle()) { ctx.ui.notify("Wait for the agent to finish before linking.", "warning"); return; }
			try {
				const resolved = mirrorTarget(filepath, ctx.cwd, binding?.directory);
				if (!archive) {
					archive = binding ? openCourse(binding.directory) : new TranscriptArchive(
						path.join(learningRoot(ctx.cwd), "curricula", ".md-log", ctx.sessionManager.getSessionId()), "会话转录");
				}
				replay(ctx);
				archive.link(resolved, Boolean(binding));
				if (!binding) pi.appendEntry("md-log", { file: resolved, archiveDir: archive.directory });
				status(ctx);
				ctx.ui.notify(`Linked: ${resolved} (complete archive synced; automatic recording continues)`, "success");
			} catch (error) { report(ctx, error); }
		},
	});

	pi.registerCommand("md-unlog", {
		description: "Detach the reading document; course automatic transcription continues",
		handler: async (_args, ctx) => {
			try {
				if (!archive?.state.mirror) { ctx.ui.notify("No reading document linked", "warning"); return; }
				archive.unlink();
				if (!binding) {
					pi.appendEntry("md-log", { file: null });
					archive = null;
				}
				status(ctx);
				ctx.ui.notify(binding ? "Reading mirror detached; course automatic recording continues." : "Session mirror detached.", "info");
			} catch (error) { report(ctx, error); }
		},
	});
}
