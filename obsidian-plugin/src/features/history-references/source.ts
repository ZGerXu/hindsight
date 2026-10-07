import { MarkdownView, TFile, type App } from "obsidian";
import { fileURLToPath } from "node:url";
import { relative, isAbsolute } from "node:path";
import { locateHistory, parseHistory, type HistoryDocument, type HistoryEvent, type HistoryReference } from "./parser";

export class HistoryDocuments {
  private cache = new Map<string, { text: string; document: HistoryDocument }>();
  constructor(private app: App) {}
  parse(path: string, text: string): HistoryDocument {
    const cached = this.cache.get(path);
    if (cached?.text === text) return cached.document;
    const document = parseHistory(text);
    this.cache.delete(path);
    this.cache.set(path, { text, document });
    if (this.cache.size > 16) this.cache.delete(this.cache.keys().next().value!);
    return document;
  }
  async read(file: TFile): Promise<{ text: string; document: HistoryDocument }> {
    const view = this.app.workspace.getLeavesOfType("markdown").map((leaf) => leaf.view)
      .find((view): view is MarkdownView => view instanceof MarkdownView && view.file?.path === file.path && view.getMode() === "source");
    const text = view ? view.editor.getValue() : await this.app.vault.cachedRead(file);
    return { text, document: this.parse(file.path, text) };
  }
  async resolve(reference: HistoryReference, sourcePath: string): Promise<{ file: TFile; text: string; events: HistoryEvent[] }> {
    const local = this.app.vault.getFileByPath(sourcePath);
    if (local) {
      const source = await this.read(local);
      if (reference.event_ids.every((id) => source.document.events.has(`${reference.archive_id}:${id}`))) return { file: local, text: source.text, events: locateHistory(source.document, reference) };
    }
    // Only files in this vault are navigation candidates; never open an arbitrary external URI.
    const adapter = this.app.vault.adapter as typeof this.app.vault.adapter & { getBasePath?(): string };
    const base = adapter.getBasePath?.();
    if (base) {
      const path = relative(base, fileURLToPath(reference.archive_uri));
      if (!isAbsolute(path) && path !== ".." && !path.startsWith("..\\") && !path.startsWith("../")) {
        const file = this.app.vault.getFileByPath(path.replaceAll("\\", "/"));
        if (file) { const source = await this.read(file); return { file, text: source.text, events: locateHistory(source.document, reference) }; }
      }
    }
    const candidates = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (file === local) continue;
      const text = await this.app.vault.cachedRead(file);
      if (!text.includes(`<!-- md-log:archive:${reference.archive_id} -->`)) continue;
      const source = await this.read(file);
      try { candidates.push({ file, text: source.text, events: locateHistory(source.document, reference) }); } catch { /* Reject incomplete or mismatched copies. */ }
    }
    if (candidates.length > 1) throw new Error("找到多份历史转录。请在目标阅读笔记中打开此引用，或更新脚注的原本 URI。");
    if (!candidates.length) throw new Error("当前 vault 中未找到被引用的历史记录。请加入对应的课程转录。");
    return candidates[0];
  }
  clear(): void { this.cache.clear(); }
}
