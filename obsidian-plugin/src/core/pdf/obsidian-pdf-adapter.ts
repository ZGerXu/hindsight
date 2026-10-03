import type { WorkspaceLeaf } from "obsidian";
import type { PdfTextItem } from "./text-anchor";

export interface PdfDocument {
  numPages: number;
  getPage(page: number): Promise<{ getTextContent(): Promise<{ items: (PdfTextItem | { type: string })[] }> }>;
}

// Obsidian exposes page links publicly, but not its PDF.js document. Keep the optional
// text-layer integration here so a reader update cannot break basic page navigation.
export async function getPdfDocument(leaf: WorkspaceLeaf): Promise<PdfDocument | null> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const view = leaf.view as unknown as {
      viewer?: { child?: { pdfViewer?: { pdfDocument?: PdfDocument }; pdfDocument?: PdfDocument } };
    };
    const child = view.viewer?.child;
    const document = child?.pdfViewer?.pdfDocument ?? child?.pdfDocument;
    if (document) return document;
    if (leaf.view.getViewType() !== "pdf") return null;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}
