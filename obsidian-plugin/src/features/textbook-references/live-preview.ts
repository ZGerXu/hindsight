import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { editorInfoField, editorLivePreviewField } from "obsidian";
import type { FeatureContext } from "../../core/feature";
import type { Citation } from "./model";
import type { CitationDocumentStore } from "./document-store";
import { createCitationButton } from "./ui";

class CitationWidget extends WidgetType {
  constructor(private citation: Citation, private context: FeatureContext) { super(); }
  eq(other: CitationWidget): boolean {
    return this.citation.key === other.citation.key && this.citation.label === other.citation.label &&
      JSON.stringify(this.citation.reference) === JSON.stringify(other.citation.reference);
  }
  toDOM(view: EditorView): HTMLElement { return createCitationButton(this.citation, this.context, view.dom.ownerDocument); }
  ignoreEvent(): boolean { return true; }
}

export function createLivePreview(context: FeatureContext, documents: CitationDocumentStore) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = this.build(view); }
    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged || update.selectionSet || update.transactions.some((transaction) => transaction.reconfigured)) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView): DecorationSet {
      if (!context.settings.textbookReferences.enabled || !view.state.field(editorLivePreviewField, false)) return Decoration.none;
      const path = view.state.field(editorInfoField, false)?.file?.path;
      if (!path) return Decoration.none;
      const document = documents.parse(path, view.state.doc.toString());
      const ranges = [];
      for (const occurrence of document.occurrences) {
        if (!view.visibleRanges.some((range) => range.from <= occurrence.to && range.to >= occurrence.from)) continue;
        // Keep the source editable whenever any cursor/selection touches the marker's line.
        const line = view.state.doc.lineAt(occurrence.from);
        if (view.state.selection.ranges.some((selection) => selection.from <= line.to && selection.to >= line.from)) continue;
        ranges.push(Decoration.replace({ widget: new CitationWidget(occurrence.citation, context) }).range(occurrence.from, occurrence.to));
      }
      // Definitions remain editable; the source text is never changed or hidden across lines.
      return Decoration.set(ranges, true);
    }
  }, { decorations: (plugin) => plugin.decorations });
}
