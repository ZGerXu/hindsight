import { Component, MarkdownPreviewRenderer, MarkdownView } from "obsidian";
import type { FeatureContext } from "../../core/feature";
import { CitationDocumentStore } from "./document-store";
import { createLivePreview } from "./live-preview";
import { renderReadingView } from "./reading-view";

export class TextbookReferencesFeature extends Component {
  readonly documents = new CitationDocumentStore();
  constructor(private context: FeatureContext) { super(); }
  onload(): void {
    const postProcessor = this.context.plugin.registerMarkdownPostProcessor((element, renderContext) =>
      renderReadingView(element, renderContext, this.context, this.documents), 100);
    const editorExtensions = [createLivePreview(this.context, this.documents)];
    this.context.plugin.registerEditorExtension(editorExtensions);
    const refreshPreviews = () => {
      for (const leaf of this.context.plugin.app.workspace.getLeavesOfType("markdown")) {
        if (leaf.view instanceof MarkdownView) leaf.view.previewMode.rerender(true);
      }
    };
    let active = true;
    this.context.plugin.app.workspace.onLayoutReady(() => { if (active) refreshPreviews(); });
    this.register(() => {
      active = false;
      MarkdownPreviewRenderer.unregisterPostProcessor(postProcessor);
      editorExtensions.length = 0;
      this.documents.clear();
      this.context.plugin.app.workspace.updateOptions();
      refreshPreviews();
    });
  }
}
