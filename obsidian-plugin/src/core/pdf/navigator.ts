import { Notice, type App, type WorkspaceLeaf } from "obsidian";
import type { LearningSettings } from "../settings";
import type { PdfReference } from "./types";
import { getPdfDocument } from "./obsidian-pdf-adapter";
import { PdfSourceResolver } from "./source-resolver";
import { findTextSelection } from "./text-anchor";

export class PdfNavigator {
  private request = 0;
  private splitLeaf: WorkspaceLeaf | null = null;
  private disposed = false;

  constructor(private app: App, private settings: LearningSettings, readonly sources: PdfSourceResolver) {}

  async open(reference: PdfReference, newTab = false): Promise<void> {
    if (this.disposed) return;
    const request = ++this.request;
    try {
      const file = await this.sources.resolve(reference.source_sha256, reference.source_uri);
      if (request !== this.request) return;
      let leaf = !newTab ? this.app.workspace.getLeavesOfType("pdf").find((leaf) => leaf.getViewState().state?.file === file.path) : undefined;
      if (!leaf) {
        if (newTab || !this.settings.textbookReferences.openInSplit) leaf = this.app.workspace.getLeaf("tab");
        else {
          const existing = this.splitLeaf && this.app.workspace.getLeavesOfType("pdf").includes(this.splitLeaf);
          leaf = existing ? this.splitLeaf! : this.app.workspace.getLeaf("split", "vertical");
          this.splitLeaf = leaf;
        }
      }
      await leaf.openFile(file, { active: true, eState: { subpath: `#page=${reference.pdf_page}` } });
      const document = await getPdfDocument(leaf);
      if (request !== this.request) return;
      if (document && (reference.pdf_page_end ?? reference.pdf_page) > document.numPages) {
        throw new Error(`引用页码超出教材范围（共 ${document.numPages} 页）。`);
      }
      const anchor = reference.quote ?? reference.locator;
      if (document && anchor) {
        for (let page = reference.pdf_page; page <= (reference.pdf_page_end ?? reference.pdf_page); page++) {
          const content = await (await document.getPage(page)).getTextContent();
          if (request !== this.request) return;
          const items = content.items.filter((item): item is import("./text-anchor").PdfTextItem => "str" in item);
          const selection = findTextSelection(items, anchor);
          if (selection) {
            leaf.setEphemeralState({ subpath: `#page=${page}&selection=${selection.join(",")}` });
            await this.app.workspace.revealLeaf(leaf);
            return;
          }
        }
        new Notice("已打开来源页；该页文本层未匹配到引文或图号，可对照引用详情查阅。");
      } else if (anchor) new Notice("已打开来源页；当前阅读器未提供文本层定位。");
      await this.app.workspace.revealLeaf(leaf);
    } catch (error) {
      if (request === this.request) new Notice(error instanceof Error ? error.message : String(error), 7000);
    }
  }

  dispose(): void { this.disposed = true; this.request++; this.sources.clear(); }
}
