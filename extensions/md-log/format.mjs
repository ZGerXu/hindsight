export function callout(type, title, bodyLines) {
	const lines = [`> [!${type}] ${title}`];
	for (const line of bodyLines) {
		lines.push(line.length === 0 ? ">" : `> ${line}`);
	}
	return lines.join("\n");
}

export function userBlock(text) {
	return `> [!quote] YOU\n\n${text}`;
}

// Skill declarations (`<skill name="..." ...> ...whole SKILL.md... </skill>`)
// are system-injected context, not user prose. Replace each with a compact
// callout noting the skill was loaded, so the log keeps the signal without
// the noise. Runs on already-trimmed text.
export function stripSkillBlocks(text) {
	return text.replace(
		/<skill\b([^>]*)>[\s\S]*?<\/skill>/g,
		(_match, attrs) => {
			const name = /name="([^"]+)"/.exec(attrs)?.[1];
			return `> [!note] SKILL loaded: ${name ?? "(unknown)"}`;
		},
	);
}

export function assistantBlock(text) {
	return `> [!abstract] PI\n\n${text}`;
}

export function optionsList(options) {
	return options.map((o, i) => `${i + 1}. ${o.label}`);
}

export function questionCallout(label, question, context, options) {
	const body = [];
	for (const line of question.split("\n")) body.push(line);
	if (context) {
		body.push("");
		for (const line of context.split("\n")) body.push(line);
	}
	if (options.length > 0) {
		body.push("");
		body.push(...optionsList(options));
	}
	return callout("question", label, body);
}

export function answerCalloutQuiz(details) {
	const status = details?.status;
	if (status === "cancelled") {
		return callout("warning", "Quiz — cancelled", ["(user skipped)"]);
	}
	if (status === "unavailable") {
		return callout("warning", "Quiz — unavailable", [details?.message || ""]);
	}
	// "I don't know" is neither correct nor incorrect — it's a distinct signal,
	// so it never renders as a red ✗.
	const dontKnow = details?.dontKnow === true;
	const correct = details?.correct === true;
	const type = dontKnow ? "question" : correct ? "success" : "failure";
	const title = dontKnow
		? "Quiz — I don't know"
		: correct
			? "Quiz — correct ✓"
			: "Quiz — incorrect ✗";
	const body = [];

	if (dontKnow) {
		body.push("Your answer: I don't know");
	} else {
		const answers = details?.answers || [];
		const sel = answers.map((a) => `${a.index}. ${a.label}`).join(", ") || "(none)";
		body.push(`Your answer: ${sel}`);
	}

	const correctIndices = details?.correctIndices || [];
	const correctStr = correctIndices.map((i) => `${i}`).join(", ");
	body.push(`Correct answer: ${correctStr}`);

	// Optional free-text note the user typed in the always-present note field.
	// Only present (in details) when non-empty, so no guard for empty strings.
	if (details?.note) {
		body.push("");
		const noteLines = String(details.note).split("\n");
		body.push(`Note: ${noteLines[0]}`);
		for (let i = 1; i < noteLines.length; i++) body.push(noteLines[i]);
	}

	if (details?.explanation) {
		body.push("");
		for (const line of String(details.explanation).split("\n")) body.push(line);
	}
	return callout(type, title, body);
}

export function answerCalloutAsk(details) {
	const status = details?.status;
	if (status === "cancelled") {
		return callout("warning", "Question — cancelled", ["(user skipped)"]);
	}
	if (status === "unavailable") {
		return callout("warning", "Question — unavailable", [details?.message || ""]);
	}
	const answers = details?.answers || [];
	const body = answers.map((a) => {
		if (a.type === "other") return `Other: ${a.label}`;
		if (a.type === "text") return a.label;
		return `${a.index}. ${a.label}`;
	});
	if (body.length === 0) body.push("(no answer)");
	return callout("example", "Answer", body);
}
