// The archive writer escapes its marker namespace in message bodies.
// Read only committed events; never inspect a pending quiz's tool arguments.
export function findHistory(text, query, limit = 5) {
	const archiveId = text.match(/^<!-- md-log:archive:([a-f0-9-]{36}) -->\r?$/m)?.[1];
	if (!archiveId) throw new Error("Unrecognized course transcript.");
	if (!query.trim()) throw new Error("Supply a specific phrase from the earlier lesson or question.");
	const parts = text.split(/^<!-- md-log:event:([a-f0-9]{64}) -->\r?\n/gm);
	const events = [];
	for (let i = 1; i < parts.length; i += 2) events.push({ event_id: parts[i], text: parts[i + 1].trim() });
	const selected = new Set();
	let matches = 0;
	for (let i = events.length - 1; i >= 0 && matches < limit; i--) {
		if (!events[i].text.toLowerCase().includes(query.trim().toLowerCase())) continue;
		selected.add(i);
		matches++;
		if (/^> \[!question\] Quiz\r?\n/.test(events[i].text) && /^> \[![^\]]+\] Quiz —/.test(events[i + 1]?.text ?? "")) selected.add(i + 1);
		if (/^> \[![^\]]+\] Quiz —/.test(events[i].text) && /^> \[!question\] Quiz\r?\n/.test(events[i - 1]?.text ?? "")) selected.add(i - 1);
	}
	return { archive_id: archiveId, events: [...selected].sort((a, b) => a - b).map((i) => ({
		...events[i], text: events[i].text.slice(0, 6000), truncated: events[i].text.length > 6000
	})) };
}
