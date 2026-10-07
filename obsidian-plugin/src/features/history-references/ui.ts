import { Component, HoverPopover, MarkdownRenderer, MarkdownView, Notice, setIcon, type HoverParent, type TFile } from "obsidian";
import type { FeatureContext } from "../../core/feature";
import { historyPosition, type HistoryCitation, type HistoryEvent } from "./parser";
import type { HistoryDocuments } from "./source";

// This feature owns its hover content and navigation. It does not use the
// textbook citation button, tooltip, details modal or PDF navigator.
export class HistoryUI extends Component implements HoverParent {
  hoverPopover: HoverPopover | null = null;
  private currentPopover: HoverPopover | null = null;
  private disposed = false;
  constructor(private context: FeatureContext, private documents: HistoryDocuments) { super(); }

  button(citation: HistoryCitation, sourcePath: string, document: Document): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "foresight-history-reference";
    button.dataset.historyId = citation.id;
    button.setAttribute("aria-label", `${citation.label}，悬停查看历史内容，点击定位记录`);
    const icon = button.createSpan({ cls: "foresight-history-icon" });
    setIcon(icon, "history");
    button.createSpan({ text: citation.label });
    button.addEventListener("mouseenter", () => { void this.preview(citation, sourcePath, button); });
    button.addEventListener("focus", () => { void this.preview(citation, sourcePath, button); });
    button.addEventListener("keydown", (event) => { if (event.key === "Escape") this.close(); });
    button.addEventListener("mousedown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.preventDefault(); event.stopPropagation();
      this.close();
      void this.open(citation, sourcePath, event.ctrlKey || event.metaKey);
    });
    return button;
  }

  private close(): void {
    const popover = this.currentPopover;
    this.currentPopover = null;
    this.hoverPopover = null;
    // Obsidian's native hide also clears its pending timer and target listeners.
    const native = popover as (HoverPopover & { hide?(): void }) | null;
    native?.hide?.();
    popover?.unload();
    popover?.hoverEl.remove();
  }

  private async preview(citation: HistoryCitation, sourcePath: string, button: HTMLElement): Promise<void> {
    if (this.disposed || !this.context.settings.historyReferences.enabled) return;
    this.close();
    const popover = new HoverPopover(this, button, 180);
    // The native onShow assigns parent.hoverPopover. Assigning it here would
    // make onShow hide its own popover as though it were the previous one.
    this.currentPopover = popover;
    const container = popover.hoverEl;
    container.classList.add("foresight-history-popover");
    container.setAttribute("role", "dialog");
    container.setAttribute("aria-label", citation.label);
    // Native placement must follow async Markdown's final height. Obsidian
    // owns this observer and disconnects it when the popover unloads.
    const native = popover as HoverPopover & { watchResize?(element: HTMLElement): void };
    native.watchResize?.(container);
    container.createDiv({ cls: "foresight-history-heading", text: citation.label });
    const status = container.createDiv({ cls: "foresight-history-location", text: "读取历史记录…" });
    const content = container.createDiv({ cls: "foresight-history-content markdown-rendered" });
    try {
      const source = await this.documents.resolve(citation.reference, sourcePath);
      if (this.disposed || this.currentPopover !== popover) return;
      status.setText(`${source.file.name} · ${source.events.length > 1 ? "题目与回答" : "历史原文"}`);
      for (const [index, event] of source.events.entries()) {
        const section = content.createDiv({ cls: "foresight-history-event" });
        await MarkdownRenderer.render(this.context.plugin.app, event.markdown, section, source.file.path, popover);
        if (this.disposed || this.currentPopover !== popover) return;
        const jump = section.createEl("button", { cls: "foresight-history-jump", text: "前往这段记录" });
        jump.addEventListener("click", () => {
          this.close();
          void this.open(citation, sourcePath, false, index);
        });
      }
    } catch (error) {
      if (this.currentPopover !== popover) return;
      status.setText("历史记录暂不可用");
      content.createEl("p", { cls: "foresight-history-error", text: error instanceof Error ? error.message : String(error) });
    }
  }

  private async open(citation: HistoryCitation, sourcePath: string, newTab: boolean, index = 0): Promise<void> {
    try {
      if (this.disposed) return;
      const source = await this.documents.resolve(citation.reference, sourcePath);
      if (!this.disposed) await this.navigate(source.file, source.text, source.events[index], index === 0 ? citation.reference.quote : undefined, newTab);
    } catch (error) { new Notice(error instanceof Error ? error.message : String(error), 6000); }
  }

  private async navigate(file: TFile, text: string, event: HistoryEvent, quote: string | undefined, newTab: boolean): Promise<void> {
    if (this.disposed) return;
    const { app } = this.context.plugin;
    const position = historyPosition(text, event, quote);
    const location = (offset: number) => {
      const before = text.slice(0, offset);
      return { line: before.split("\n").length - 1, col: offset - before.lastIndexOf("\n") - 1, offset };
    };
    const leaf = (!newTab && app.workspace.getLeavesOfType("markdown").find((leaf) => leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path)) || app.workspace.getLeaf("tab");
    await leaf.openFile(file, { eState: { line: position.line, startLoc: location(position.from), endLoc: location(position.to), focus: true } });
    await app.workspace.revealLeaf(leaf);
    app.workspace.setActiveLeaf(leaf, { focus: true });
    if (leaf.view instanceof MarkdownView && leaf.view.getMode() === "source") {
      const editor = leaf.view.editor;
      const from = editor.offsetToPos(position.from);
      const to = editor.offsetToPos(position.to);
      editor.setSelection(from, to);
      editor.scrollIntoView({ from, to }, true);
    }
  }

  onunload(): void { this.disposed = true; this.close(); }
}
