# Textbook analysis and course design

Use this reference when building or revising the route. The result is a sequential course, not a searchable collection of summaries.

## Establish what has actually been read

The extractor preserves PDF physical pages, numbered from 1 including covers. Printed page numbers and chapter titles require inspection: front matter, inserts, and numbering resets make a single global offset unreliable. Cite `PDF pp. 23–26; printed pp. 7–10; §2.1` only when each part is known. Otherwise leave the printed reference unknown. Also record exercise numbers, figure numbers, or section headings when useful.

First read the contents and preface to identify the author's intended audience, progression, and conventions. Across **all** chapters inspect goals, prerequisite-bearing passages, representative explanations, and exercises. Save each original section's page range and destination. If no contents page exists, derive the inventory from actual headings; record uncertain boundaries instead of inventing chapter names.

Track two independent things in `course.md`:

- Extraction: text available, warning, or unavailable, by physical page range.
- Review: `unreviewed`, `structure_reviewed`, or `detail_reviewed`, by section. Structural review supports a provisional module route; actionable units require detailed review of their source material and prerequisite passages.

Do not equate blank extraction with a blank original page. A cover, equation page, diagram, or scan may all produce little text. Inspect flagged pages needed for coverage. Use `pdftoppm -f <page> -l <page> -singlefile -scale-to 1600 -png "<pdf>" "<temporary-prefix>"` and an available image reader to inspect the original page. If no image reader exists, leave figure-dependent content unverified. Text PDF support does not imply tables, formulas, or reading order were correctly extracted.

## Audit against learning dependencies

For each section, identify the capability it should produce, what the learner must already know, how the book establishes the idea, and what would demonstrate learning. Then check:

| Finding | Evidence to seek | Possible change |
| --- | --- | --- |
| Prerequisite introduced late | A worked example uses a concept before it is defined | Move its introduction earlier or insert a labeled bridge |
| Too many objectives in one chapter | Several independent capabilities or a task exceeding the session budget | Split by capability with intermediate outputs |
| Unmotivated abstraction or skipped derivation | A formula/step appears without the problem or required reasoning | Add motivation, an example, or a missing derivation |
| Misaligned practice | Exercises require unseen concepts or only test recognition of a procedural goal | Move the exercise or add target-aligned practice |
| Repetition | Sections achieve the same capability without adding a distinct application | Merge coverage, retaining source references |
| Suspected factual/technical error | A specific conflicting statement, example, erratum, or current authoritative specification | Verify first; distinguish error, historical convention, and version difference |

Every adjustment records: ID, type (`factual`, `sequencing`, or `learner_adaptation`), original location, observed evidence, learning impact, action, new module/unit destination, and verification status/source. A preference for a different explanation is learner adaptation, not proof that the book is wrong.

Use actual definitions and valid assumptions as foundations. Do not remove boundary conditions to make a theorem sound unconditional. Dependencies should express what is required to perform the next task, not every association between topics. If a dependency cycle appears, separate an intuitive introduction from the later formal treatment rather than publishing a cyclic learning order.

The user permits cross-chapter restructuring. Preserve the course's coverage through one or more mapped destinations for every original section: required, optional, merged coverage, or deferred with a reason/revisit condition. Do not quietly drop core material to shorten the plan. A change to the learner's stated end goal is a scope decision to discuss; implementing an already authorized restructuring is not a new approval gate.

## From modules to SMART units

Create a full module route with stable `M001`-style IDs, objectives, prerequisites, source sections, and exit criteria. Order is a separate column. Module IDs and `U001`-style unit IDs are assigned once, never reused or derived from a mutable position/page number.

Detail the upcoming 3–5 actionable units, then roll the window forward. A module can be `provisional`, `ready`, or `blocked` as a **planning** label; these labels do not state learner progress. Review deferred source material before making its units ready. Completing a module requires evidence for all its required objectives, not just finishing the currently expanded units.

Use the [unit template](../assets/unit.md). A unit needs:

- **S:** one main observable capability with an action and an object.
- **M:** a task, required output, and criterion that could distinguish success from failure. Do not use a universal quiz percentage. A calculation may require a correct result and justified steps; a concept may require explaining a dependency and applying it to a fresh example.
- **A:** prerequisites with links to evidence or explicit `unknown`, allowed supports, and a task small enough for the learner. Unknown essential prerequisites need diagnosis/bridging first.
- **R:** original source locations, course objective, and downstream use. Label any supplemental bridge or generated exercise.
- **T:** a realistic total time including recall, explanation, activity, checks, and saving. Default 15 minutes; use 10–20 when appropriate. A within-session deadline is sufficient unless the learner supplied a real calendar deadline.

For example, “understand gradient descent, pp. 20–40” is not a unit. A suitable unit is “given a one-variable quadratic and a learning rate, calculate one update and explain its direction”: verified derivative prerequisite, a worked derivation, an independent variant with a justified result, and a 15-minute budget. This is an illustrative pattern, not an instruction to add calculus to unrelated courses.

Do not split only at page counts or equal time intervals. End a substep with something usable next time: a stated assumption, intermediate equation, explained connection, tested function, or saved experimental result. Save the exact artifact and remaining work. Long experiments may span units for setup, implementation, observation, and interpretation; machine waiting time and active learner time are different estimates.

## Checks before publishing or changing a route

- Every original section has a destination or explicit deferral; every supplemental unit has a reason and source/derivation.
- Module and detailed-unit dependencies exist, are acyclic, and respect the proposed order. References to future modules remain explicit rather than pretending their units already exist.
- Upcoming units have reviewed source ranges, feasible prerequisites, all SMART fields, and distinct output/acceptance criteria.
- The lesson's roots retain their assumptions, and suspected errors have not silently become asserted corrections.
- Adjustments are traceable both from the original section to the new route and from each unit back to its sources.
- Only the upcoming window is detailed; actual evidence and time estimates inform its next revision.

For route changes, preserve existing IDs and history. Moving a unit preserves its evidence. Splitting/replacing it creates new IDs and an old→new mapping, with an inactive lifecycle flag on the old definition. An old completion transfers only to new criteria the saved evidence actually covers; do not automatically mark every replacement completed.
