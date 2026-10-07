import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { editorInfoField, editorLivePreviewField } from "obsidian";
import type { FeatureContext } from "../../core/feature";
import type { HistoryCitation } from "./parser";
import type { HistoryDocuments } from "./source";
import type { HistoryUI } from "./ui";

class HistoryWidget extends WidgetType {
  constructor(private citation: HistoryCitation, private path: string, private ui: HistoryUI) { super(); }
  eq(other: HistoryWidget): boolean { return this.path === other.path && this.citation.label === other.citation.label && this.citation.id === other.citation.id && JSON.stringify(this.citation.reference) === JSON.stringify(other.citation.reference); }
  toDOM(view: EditorView): HTMLElement { return this.ui.button(this.citation, this.path, view.dom.ownerDocument); }
  ignoreEvent(): boolean { return true; }
}

export function historyLivePreview(context: FeatureContext, documents: HistoryDocuments, ui: HistoryUI) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = this.build(view); }
    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged || update.selectionSet || update.transactions.some((transaction) => transaction.reconfigured)) this.decorations = this.build(update.view);
    }
    build(view: EditorView): DecorationSet {
      if (!context.settings.historyReferences.enabled || !view.state.field(editorLivePreviewField, false)) return Decoration.none;
      const path = view.state.field(editorInfoField, false)?.file?.path;
      if (!path) return Decoration.none;
      const document = documents.parse(path, view.state.doc.toString());
      const ranges = [];
      for (const occurrence of document.occurrences) {
        if (!view.visibleRanges.some((range) => range.from <= occurrence.to && range.to >= occurrence.from)) continue;
        const line = view.state.doc.lineAt(occurrence.from);
        if (view.state.selection.ranges.some((selection) => selection.from <= line.to && selection.to >= line.from)) continue;
        ranges.push(Decoration.replace({ widget: new HistoryWidget(occurrence.citation, path, ui) }).range(occurrence.from, occurrence.to));
      }
      return Decoration.set(ranges, true);
    }
  }, { decorations: (plugin) => plugin.decorations });
}
