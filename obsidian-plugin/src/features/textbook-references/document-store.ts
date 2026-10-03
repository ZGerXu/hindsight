import type { App } from "obsidian";
import type { CitationDocument } from "./model";
import { parseCitations } from "./parser";

export class CitationDocumentStore {
  private cache = new Map<string, { text: string; document: CitationDocument }>();

  parse(path: string, text: string): CitationDocument {
    const cached = this.cache.get(path);
    if (cached?.text === text) return cached.document;
    const document = parseCitations(text);
    this.cache.delete(path);
    this.cache.set(path, { text, document });
    if (this.cache.size > 16) this.cache.delete(this.cache.keys().next().value!);
    return document;
  }

  async read(app: App, path: string): Promise<{ text: string; document: CitationDocument } | null> {
    const file = app.vault.getFileByPath(path);
    if (!file) return null;
    const text = await app.vault.cachedRead(file);
    return { text, document: this.parse(path, text) };
  }

  clear(): void { this.cache.clear(); }
}
