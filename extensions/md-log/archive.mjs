import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";

export const digest = (text) => createHash("sha256").update(text).digest("hex");

export function learningRoot(cwd) {
	return path.basename(cwd) === ".pi" ? path.dirname(cwd) : cwd;
}

function atomicWrite(file, text) {
	const temporary = `${file}.${randomUUID()}.tmp`;
	try {
		fs.writeFileSync(temporary, text, { encoding: "utf8", flag: "wx" });
		fs.renameSync(temporary, file);
	} finally {
		if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
	}
}

function inside(file, directory) {
	const relative = path.relative(directory, file);
	return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

// Resolve symlinks/junctions before enforcing ownership. Never mirror over course state.
export function mirrorTarget(file, cwd, courseDir) {
	const resolved = fs.realpathSync(path.resolve(cwd, file));
	if (!fs.statSync(resolved).isFile() || path.extname(resolved).toLowerCase() !== ".md") {
		throw new Error(`Expected an existing Markdown file: ${resolved}`);
	}
	const curricula = path.join(learningRoot(cwd), "curricula");
	const protectedDirs = [courseDir, fs.existsSync(curricula) ? curricula : null].filter(Boolean);
	if (protectedDirs.some((dir) => inside(resolved, fs.realpathSync(dir)))) {
		throw new Error("Choose a reading document outside curricula/ and the course directory.");
	}
	// Also reject a course document selected from another learning root.
	for (let dir = path.dirname(resolved); ; dir = path.dirname(dir)) {
		if (fs.existsSync(path.join(dir, "course.md"))) {
			throw new Error("A course record cannot be used as a reading mirror.");
		}
		if (path.dirname(dir) === dir) break;
	}
	return resolved;
}

function mirrorRegion(text, id, file) {
	const prefix = `<!-- md-log:${id}:begin sha256=`;
	const end = `<!-- md-log:${id}:end -->`;
	const start = text.indexOf(prefix);
	const endIndex = text.indexOf(end);
	if (start < 0 && endIndex < 0) {
		if (text.includes(`<!-- md-log:${id}:`)) throw new Error(`Damaged mirror markers: ${file}`);
		return null;
	}
	const header = text.slice(start).match(/^<!-- md-log:[a-f0-9-]+:begin sha256=([a-f0-9]{64}) -->\r?\n/);
	const bodyStart = start + (header?.[0].length ?? 0);
	if (start < 0 || !header || endIndex < bodyStart ||
		text.indexOf(prefix, start + prefix.length) >= 0 || text.indexOf(end, endIndex + end.length) >= 0) {
		throw new Error(`Damaged or duplicate mirror markers: ${file}`);
	}
	const body = text.slice(bodyStart, endIndex);
	// Editors may normalize line endings without changing the lesson.
	if (digest(body) !== header[1] && digest(body.replaceAll("\r\n", "\n")) !== header[1]) {
		throw new Error(`The generated transcript was edited; preserve those edits outside its markers before relinking: ${file}`);
	}
	return { start, end: endIndex + end.length, body };
}

function eventBodies(text) {
	const parts = text.replaceAll("\r\n", "\n").split(/^<!-- md-log:event:([a-f0-9]{64}) -->\n/gm);
	const events = new Map();
	for (let index = 1; index < parts.length; index += 2) events.set(parts[index], parts[index + 1]);
	return { preamble: parts[0], events };
}

// A pre-course /md-log creates a session mirror. Once all its content is in the
// course, keeping that frozen copy at the end falsely suggests recording stopped.
// Remove only intact generated copies; their original archives remain on disk.
function consolidateSessionRegions(text, source, courseId, file) {
	const sourceEvents = eventBodies(source).events;
	const sourceBodies = new Set(sourceEvents.values());
	const sessions = [...text.matchAll(/^<!-- md-log:archive:([a-f0-9-]+) -->\r?\n# 会话转录\r?\n/gm)];
	for (const [, id] of sessions) {
		if (id === courseId) continue;
		let region;
		try { region = mirrorRegion(text, id, file); } catch { continue; } // Preserve edited or damaged inactive regions.
		if (!region) continue;
		const { preamble, events } = eventBodies(region.body);
		if (preamble !== `<!-- md-log:archive:${id} -->\n# 会话转录\n\n`) continue;
		const covered = [...events].every(([eventId, body]) => sourceEvents.get(eventId) === body ||
			(/^## 会话 [^\n]+\n\n<!-- pi-session:[^\n]+ -->\n\n$/.test(body) && sourceBodies.has(body)));
		if (covered) text = text.slice(0, region.start) + text.slice(region.end);
	}
	return text;
}

/** One writer per course, as with progress.md. Markdown is the durable source;
 * state.json only remembers identity and the explicitly selected mirror. */
export class TranscriptArchive {
	constructor(directory, title) {
		fs.mkdirSync(directory, { recursive: true });
		this.directory = fs.realpathSync(directory);
		this.file = path.join(this.directory, "archive.md");
		this.stateFile = path.join(this.directory, "state.json");
		const existing = fs.existsSync(this.file) ? fs.readFileSync(this.file, "utf8") : null;
		const archiveId = existing?.match(/^<!-- md-log:archive:([a-f0-9-]+) -->\r?\n/)?.[1];
		if (existing !== null && !archiveId) throw new Error(`Unrecognized transcript: ${this.file}`);
		this.state = fs.existsSync(this.stateFile)
			? JSON.parse(fs.readFileSync(this.stateFile, "utf8"))
			: { version: 1, id: archiveId ?? randomUUID(), mirror: null };
		if (this.state.version !== 1 || typeof this.state.id !== "string" ||
			(this.state.mirror !== null && typeof this.state.mirror !== "string") ||
			(archiveId && this.state.id !== archiveId)) {
			throw new Error(`Invalid transcript state: ${this.stateFile}`);
		}
		if (existing === null) {
			if (fs.existsSync(this.stateFile)) throw new Error(`Transcript is missing; restore it before continuing: ${this.file}`);
			atomicWrite(this.file, `<!-- md-log:archive:${this.state.id} -->\n# ${title}\n\n`);
		}
		if (!fs.existsSync(this.stateFile)) this.saveState();
	}

	saveState() {
		atomicWrite(this.stateFile, JSON.stringify(this.state, null, 2) + "\n");
	}

	append(records) {
		const previous = fs.readFileSync(this.file, "utf8");
		const ids = new Set([...previous.matchAll(/^<!-- md-log:event:([a-f0-9]{64}) -->\r?$/gm)].map((m) => m[1]));
		let next = previous;
		for (const record of records) {
			if (ids.has(record.id)) continue;
			// Reserve our marker namespace, including in quoted user/assistant text.
			const body = record.text.replaceAll("<!-- md-log:", "&lt;!-- md-log:");
			next += `<!-- md-log:event:${record.id} -->\n${body}\n\n`;
			ids.add(record.id);
		}
		if (next !== previous) atomicWrite(this.file, next);
	}

	sync(file, consolidateSessions = false) {
		const body = fs.readFileSync(this.file, "utf8");
		const current = fs.readFileSync(file, "utf8");
		const prefix = `<!-- md-log:${this.state.id}:begin sha256=`;
		const end = `<!-- md-log:${this.state.id}:end -->`;
		const region = mirrorRegion(current, this.state.id, file);
		const block = `${prefix}${digest(body)} -->\n${body}${end}`;
		let next;
		if (!region) {
			next = current + (current && !current.endsWith("\n\n") ? "\n\n" : "") + block + "\n";
		} else {
			next = current.slice(0, region.start) + block + current.slice(region.end);
		}
		if (consolidateSessions) next = consolidateSessionRegions(next, body, this.state.id, file);
		if (next !== current) atomicWrite(file, next);
	}

	link(file, consolidateSessions = false) {
		this.sync(file, consolidateSessions);
		this.state.mirror = file;
		this.saveState();
	}

	unlink() {
		this.state.mirror = null;
		this.saveState();
	}
}
