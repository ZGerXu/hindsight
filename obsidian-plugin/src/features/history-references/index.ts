import { Component, MarkdownPreviewRenderer, MarkdownView } from "obsidian";
import type { FeatureContext } from "../../core/feature";
import { HistoryDocuments } from "./source";
import { HistoryUI } from "./ui";
import { renderHistory } from "./reading-view";
import { historyLivePreview } from "./live-preview";

export class HistoryReferencesFeature extends Component {
  readonly documents: HistoryDocuments;
  private ui: HistoryUI;
  constructor(private context: FeatureContext) {
    super();
    this.documents = new HistoryDocuments(context.plugin.app);
    this.ui = new HistoryUI(context, this.documents);
  }
  onload(): void {
    this.addChild(this.ui);
    const processor = this.context.plugin.registerMarkdownPostProcessor((element, renderContext) => renderHistory(element, renderContext, this.context, this.documents, this.ui), 110);
    const extensions = [historyLivePreview(this.context, this.documents, this.ui)];
    this.context.plugin.registerEditorExtension(extensions);
    const refresh = () => {
      for (const leaf of this.context.plugin.app.workspace.getLeavesOfType("markdown")) if (leaf.view instanceof MarkdownView) leaf.view.previewMode.rerender(true);
    };
    let active = true;
    this.context.plugin.app.workspace.onLayoutReady(() => { if (active) refresh(); });
    this.register(() => {
      active = false;
      MarkdownPreviewRenderer.unregisterPostProcessor(processor);
      extensions.length = 0;
      this.documents.clear();
      this.context.plugin.app.workspace.updateOptions();
      refresh();
    });
  }
}
