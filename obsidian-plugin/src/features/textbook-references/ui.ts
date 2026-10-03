import { FuzzySuggestModal, Menu, Modal, Notice, Setting, TFile, setIcon, setTooltip, type App } from "obsidian";
import type { FeatureContext } from "../../core/feature";
import type { Citation } from "./model";

export class PdfBindingModal extends FuzzySuggestModal<TFile> {
  constructor(app: App, private citation: Citation, private context: FeatureContext) {
    super(app);
    this.setPlaceholder("选择原书 PDF（会核对教材版本）");
  }
  getItems(): TFile[] { return this.app.vault.getFiles().filter((file) => file.extension.toLowerCase() === "pdf"); }
  getItemText(file: TFile): string { return file.path; }
  onChooseItem(file: TFile): void {
    void (async () => {
      const fingerprint = await this.context.pdf.sources.fingerprint(file);
      if (fingerprint !== this.citation.reference.source_sha256) throw new Error("所选 PDF 与此引用的教材版本不一致，未绑定。");
      this.context.settings.pdfBindings[fingerprint] = file.path;
      await this.context.saveSettings();
      new Notice(`教材已绑定：${file.name}`);
    })().catch((error) => new Notice(String(error), 7000));
  }
}

class CitationDetailsModal extends Modal {
  constructor(app: App, private citation: Citation, private context: FeatureContext) { super(app); }
  onOpen(): void {
    const { citation, contentEl } = this;
    const ref = citation.reference;
    contentEl.createEl("h2", { text: citation.label });
    contentEl.createEl("p", { text: locationText(citation) });
    if (ref.locator) contentEl.createEl("p", { text: `定位：${ref.locator}` });
    if (ref.quote) contentEl.createEl("blockquote", { text: ref.quote });
    const source = decodeURIComponent(new URL(ref.source_uri).pathname.split("/").pop() ?? "PDF");
    contentEl.createEl("p", { text: source, cls: "foresight-reference-source" });
    new Setting(contentEl)
      .addButton((button) => button.setButtonText("在 Obsidian 中打开原文").setCta().onClick(() => {
        this.close();
        void this.context.pdf.open(ref);
      }))
      .addButton((button) => button.setButtonText("绑定教材 PDF").onClick(() => {
        this.close();
        new PdfBindingModal(this.app, citation, this.context).open();
      }));
  }
  onClose(): void { this.contentEl.empty(); }
}

export function locationText(citation: Citation): string {
  const ref = citation.reference;
  const range = ref.pdf_page_end && ref.pdf_page_end !== ref.pdf_page ? `–${ref.pdf_page_end}` : "";
  return `PDF 第 ${ref.pdf_page}${range} 页${ref.printed_page ? ` · 书页 ${ref.printed_page}` : ""}`;
}

export function createCitationButton(citation: Citation, context: FeatureContext, ownerDocument: Document): HTMLButtonElement {
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.className = "foresight-citation";
  button.dataset.citationKey = citation.key;
  button.dataset.pdfPage = String(citation.reference.pdf_page);
  button.setAttribute("aria-label", `打开${citation.label}，${locationText(citation)}`);
  const icon = button.createSpan({ cls: "foresight-citation-icon" });
  setIcon(icon, "book-open");
  button.createSpan({ cls: "foresight-citation-prefix", text: "原书" });
  const label = citation.label.replace(/^原书[·\s：:—-]*/, "");
  if (label) button.createSpan({ cls: "foresight-citation-label", text: label });
  setTooltip(button, [citation.label, locationText(citation), citation.reference.locator, citation.reference.quote, "点击打开原文 · 右键查看详情"].filter(Boolean).join("\n"));
  button.addEventListener("mousedown", (event) => event.stopPropagation());
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void context.pdf.open(citation.reference, event.ctrlKey || event.metaKey);
  });
  button.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const menu = new Menu();
    menu.addItem((item) => item.setTitle("打开原文").setIcon("book-open").onClick(() => { void context.pdf.open(citation.reference); }));
    menu.addItem((item) => item.setTitle("查看引用详情").setIcon("info").onClick(() => new CitationDetailsModal(context.plugin.app, citation, context).open()));
    menu.addItem((item) => item.setTitle("绑定教材 PDF").setIcon("file-symlink").onClick(() => new PdfBindingModal(context.plugin.app, citation, context).open()));
    menu.showAtMouseEvent(event);
  });
  return button;
}
