# learn

[![video](assets/thumbnail.png)](https://www.youtube.com/watch?v=kzcI5F4tGiU)

My AI learning system from this video: [How I Use AI to Learn Things](https://www.youtube.com/watch?v=kzcI5F4tGiU).

This is a personal system I built for myself, shared as-is. Built as a pi configuration: the teaching philosophy encoded in a skill, a few small extensions, and agent definitions.

## What's in it

- `skills/teach/` — the philosophy and the process
- `skills/curriculum/` — turns a PDF textbook into an audited course, with SMART units for short sessions and Markdown checkpoints for resuming
- `skills/visualize/` — adds a correct, minimal diagram to a lesson when an idea is clearer as a picture
- `extensions/ask-user-question/` — the agent asks you questions through a UI popup
- `extensions/quiz/` — graded questions with instant feedback (✓/✗, correct answer, explanation)
- `extensions/md-log/` — link a markdown file to the session
- `extensions/visual-tools/` — tools for visualization subagents
- `agents/` — `researcher`, `svg-maker`, `mermaid-maker`: the subagents the system delegates to

## Install

This repo **is** a `.pi` directory. From your learning project's root:

```bash
git clone https://github.com/amosblomqvist/learn .pi
```

Then open pi in that directory. (Or copy the pieces you want into your existing project config.)

## Requirements

- [pi](https://github.com/earendil-works/pi)
- A subagent implementation, so the system can spawn the researcher and the visual makers. Recommended: [pi-interactive-subagents](https://github.com/amosblomqvist/pi-interactive-subagents) (tmux only). With it, everything works out of the box. Any other implementation works too, but expect to adapt the agent definitions, e.g. `agents/researcher.md` lists `safe_bash` in its tools, which is specific to that extension.
- `ask-user-question` — use the copy bundled here. If your setup already has an `ask-user-question` extension, use **this** one in its place. Popups from different extensions serialize through a shared UI lock, which only works when it's the same implementation.

## Notes

### Textbook courses

Use `curriculum` for sequential learning from a **text PDF**. It maps the whole book, checks prerequisite order and exercise alignment, records justified reorderings, and details the next 3–5 units. Sessions default to 15 minutes, including practice and checks. Scanned books need a searchable PDF first; Word/Google Docs and whole-book OCR are outside this first version.

```text
/skill:curriculum 根据 "E:/Books/教材.pdf" 建立课程，默认每次 15 分钟
/skill:curriculum 继续上次的课程，今天只有 5 分钟
/skill:curriculum 查看课程进度和仍需复习的内容
/skill:curriculum 这个单元太长，按我的实际进度调整后面的路线
```

Natural-language requests to plan or continue a textbook course also select the skill. If several courses match, it asks which one. If only a plan was requested, it saves the route without starting a lesson.

The extractor needs Node.js 18+ and Poppler's `pdfinfo` and `pdftotext` on PATH; `pdftoppm` plus an image reader is used for checking formulas, figures, and extraction problems. No npm packages are needed for the extractor:

```text
node .pi/skills/curriculum/scripts/pdf-source.mjs "path/to/textbook.pdf" --out "curricula/my-course/source"
```

Run this example from the learning project's root (omit `.pi/` if already inside this configuration directory). It returns a JSON summary and writes a Markdown cache named by the PDF's SHA-256, preserving physical page boundaries. Empty/suspicious pages remain explicit warnings; printed page numbers and content still require review. Exit 2 means no text was extracted; exit 1 indicates an error.

Course records live in `<learning-root>/curricula/<course-id>/`. The learning root is the current directory, or its parent when running inside the project's `.pi` directory. `course.md` records the book and audit, `roadmap.md` the full route, `units/` the detailed tasks, `progress.md` the authoritative current state, and `sessions/` the evidence and recoverable checkpoints. Resume uses these files, including an unfinished question or exercise, rather than relying on the old chat. Saving is performed by the agent at checkpoints, not by a background session hook; abrupt termination can lose work after the last saved checkpoint.

Keep `md-log` on a **separate fresh transcript file**. Linking it backfills and overwrites its target, so never point it at course records or checkpoint journals. Existing teaching, quiz, question, and visualization extensions keep their interfaces.

Extractor regression checks: `node --test .pi/skills/curriculum/tests/pdf-source.test.mjs` (from the learning root, with Poppler on PATH). The skill's [scenario checks](skills/curriculum/tests/scenarios.md) cover curriculum design and recovery decisions.

### General teaching

You can run the system without subagents. The main session does the teaching. You just lose the researcher (truth verification) and the generated visuals.

The teaching skill is written for one learner (me). Edit the skill to fit how you learn best.
