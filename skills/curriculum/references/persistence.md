# Markdown state and recovery

Read this before modifying or resuming a course. The files are the memory; the next session must work without the prior conversation. This is an agent-operated Markdown workflow, not an automatic session hook or a multi-writer database.

## File ownership and identity

Use `<learning-root>/curricula/<course-id>/`. Derive a readable filesystem-safe slug from the title, check for collisions, and reuse the recorded identity once created. Store the resolved course directory, source path, full SHA-256, and identified edition in `course.md`. A same-title book with a different fingerprint needs a version comparison, not silent reuse or a progress reset.

Use the templates in `assets/`; their `{{...}}` tokens are authoring placeholders, not runtime syntax. Fill them from observation, remove unused example rows, and use `null`/`unknown` for unknown values. Use UTF-8, ordinary relative Markdown links, and YAML frontmatter for small identifiers. Quote YAML strings containing punctuation and escape Markdown table pipes. The template's empty tables intentionally assert no mastery.

| File | Ownership |
| --- | --- |
| `course.md` | Source identity, learner profile, extraction/review coverage, section inventory, audit findings |
| `roadmap.md` | Current planning revision, module order/dependencies, unit links, definition lifecycle, revision history |
| `units/U001.md` | Unit definition, rubric, source mapping, numbered steps; no mutable completion checkbox |
| `progress.md` | Sole authoritative current learner state, checkpoint pointer, evidence summary, resume instructions |
| `sessions/<id>.md` | Historical observations and recoverable checkpoint snapshots; never a competing current-status dashboard |
| `source/<sha256>.md` | Rebuildable extractor output; never edit it to correct or annotate the textbook |

Keep assessment answers out of upcoming unit cards and pending prompts. Rubrics may describe required reasoning but must not give away the specific unanswered result. Re-read verified source material to construct an answer key when posing a quiz; save answer/feedback in the journal only after the learner has answered or explicitly chosen “I don't know.”

## State rules

Use `not_started`, `in_progress`, `completed`, `needs_review`, or `skipped` for unit status. Units not yet present in the status table default to `not_started`, never completed. The definition's `active`/`replaced` lifecycle is separate from learner status.

| Observation | State consequence |
| --- | --- |
| Teaching/reading started | `in_progress` |
| All unit acceptance criteria demonstrated | `completed`, with evidence linked |
| Initial wrong answer | Keep `in_progress`, record the misconception and next repair/check |
| Previously completed capability fails a relevant check | `needs_review`, preserving the original successful evidence |
| Successful repair meets the criteria | `completed`, with new evidence |
| `quiz` returns `dontKnow` | Explicit knowledge gap, distinct from a wrong model; no completion |
| Cancelled prompt or unavailable UI | No assessment evidence; keep the prior mastery state and save the interruption |
| User asks to skip | `skipped`, with reason and unmet dependencies; never count as mastery |
| User self-reports knowledge | Record the claim separately; only a covering diagnostic can establish completion |

For `quiz`, inspect `status` before `correct`; `dontKnow` is not interchangeable with an incorrect attempt. `correctAnswer` uses stable option values, and shuffled `correctIndices` are display positions. Preserve the returned option labels/values with the outcome; do not interpret a saved option number against newly shuffled choices. An isolated correct recognition question proves only what it tests, not an entire procedural unit.

A skipped prerequisite does not unlock dependent teaching. Diagnose it or arrange a bridge; a deliberate scope exclusion must remain visible. Open calculations, code, and explanations are assessed against the actual rubric, using the submitted work as evidence. Never fabricate output, elapsed time, or results for a learner who has not answered.

## Checkpoint protocol

Use UTC timestamps in sortable session filenames (for example `20260910T133000Z-a1b2`) and unique checkpoint IDs such as `CP-20260910T133000Z-a1b2` (letters, digits, and hyphens). Save short evidence summaries and artifact/source links rather than duplicating whole lessons. Only one session should write a given course at a time.

For **each** meaningful step completion, response, pending question, stop, or route change:

1. Read the latest `progress.md` before editing. Record its `checkpoint_id` as the next checkpoint's parent. Prepare the next complete progress snapshot, including statuses/evidence, unresolved gaps, current unit/step, and exact next action. Do not increment learning state for an unobserved answer.
2. Append an entry to the current session journal: observation, evidence, parent checkpoint ID, and the **full proposed `progress.md` snapshot** inside a fenced Markdown block. Wrap the entry with `<!-- checkpoint:<id>:begin -->` and `<!-- checkpoint:<id>:end -->`. Add the closing marker only after the evidence and snapshot are complete. Choose a longer outer fence if the snapshot itself contains a code fence.
3. Read back the completed entry. Confirm course ID, parent ID, route revision, and referenced units are consistent. Write the same snapshot to `progress.md` using a sibling temporary file and an atomic file replacement supported by the host; read it back before saying progress is saved. Do not change the proposed snapshot between journaling and promotion.

The initial checkpoint has a null parent; subsequent snapshots must replace the template's null with the actual parent ID. Starting a new session does not itself change mastery. Before handing off a question, the snapshot includes the actual prompt, necessary inputs, whether it is unanswered, and where to continue. For a partial derivation, include confirmed premises and the last established intermediate result. For a coding task, link the actual file and describe the remaining task. Do not save only “continue chapter 2.”

No guaranteed hook runs on process termination. Recovery is therefore to the last complete saved checkpoint; unsaved replies may need to be supplied again. If a write fails, report that it was not saved and retain the last durable state.

## Recovery without chat history

1. Read `course.md` identity and `progress.md`, then inspect the named journal/checkpoint. Locate the tail of newer journals by searching checkpoint markers; read only relevant entries, not all historical lesson prose.
2. Ignore entries without both markers or a complete, consistent snapshot. A marker alone does not validate a checkpoint: the snapshot's ID, parent, course, route references, and linked evidence must agree. Validate historical route numbers against the revision history; an older parent snapshot need not use the current route revision.
3. If the snapshot is already promoted, do not append it or credit its result again. If there is a unique complete successor of the current checkpoint, promote it and follow further complete successors in parent order. Do not choose by timestamp alone.
4. If `progress.md` is missing or damaged, reconstruct from the last unambiguous complete checkpoint chain for this course. Ignore temporary files and incomplete journal tails. If two successors share a parent, there is a concurrent edit/branch conflict: preserve both and reconcile the actual evidence before advancing; ask the user if the intended course state cannot be established.
5. Resume the recorded step. A cancelled or lost pending question can be re-presented using the stored prompt and newly verified grading key. A stale question may need a brief prerequisite refresh, but do not silently reset the unit or credit an unknown answer.

For a read-only progress request, report the durable state and any pending recovery discrepancy; do not create a journal or promote a checkpoint merely to show status.

## Route revisions and source changes

Increment `roadmap.md`'s `route_revision` when module/unit definitions or order change, and record the reason and old→new IDs. Write new/revised definitions first, then the revised roadmap, then checkpoint the learner-state consequences. Retain an unchanged unit's original evidence. Replaced definitions remain readable, with replacement links; they are excluded from active-unit counts, not deleted from history.

If interruption leaves a roadmap revision newer than the last learner checkpoint, reconcile the recorded revision and ID mappings before teaching. Finish a supported remapping from saved evidence; if the edit is incomplete, repair the draft route first. Do not infer new mastery from a newer route number or change old checkpoint snapshots.

On a new PDF fingerprint, retain the previous cache and record old/new edition identities and affected sections. Unaffected capabilities retain evidence. Recheck changed page references and criteria; changed claims may need review, but a file change alone does not erase learning. If a path changed but the SHA-256 is identical, update the path without a route/mastery reset.

## Report progress honestly

Report required module completion against **all** module exit criteria, and separately the completed/expanded active units, skipped items, and review needs. State when future units are not yet detailed. An expanded-unit fraction is not the whole-book completion percentage. A module with unreviewed required coverage cannot be declared completed merely because its first few units are done.

`md-log` can overwrite its target on linking and does not restore learning state into the agent. If requested, create a fresh file under `transcripts/` and give the user its `/md-log <absolute-path>` command; do not pretend the extension exposes a callable logging tool. Never use a journal as that transcript, and never reuse a prior session's transcript for a new backfill.
