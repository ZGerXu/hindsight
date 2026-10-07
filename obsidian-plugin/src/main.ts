import { MarkdownView, Notice, Plugin } from "obsidian";
import { loadSettings, type LearningSettings } from "./core/settings";
import { PdfSourceResolver } from "./core/pdf/source-resolver";
import { PdfNavigator } from "./core/pdf/navigator";
import { TextbookReferencesFeature } from "./features/textbook-references";
import { HistoryReferencesFeature } from "./features/history-references";
import { LearningSettingsTab } from "./settings-tab";

export default class ForesightPlugin extends Plugin {
  declare settings: LearningSettings;

  saveSettings(): Promise<void> { return this.saveData(this.settings); }

  async onload(): Promise<void> {
    const settings = this.settings = loadSettings(await this.loadData());
    const sources = new PdfSourceResolver(this.app, settings);
    const pdf = new PdfNavigator(this.app, settings, sources);
    const context = {
      plugin: this,
      settings,
      pdf,
      saveSettings: () => this.saveSettings()
    };
    this.register(() => context.pdf.dispose());
    const references = new TextbookReferencesFeature(context);
    this.addChild(references);
    this.addChild(new HistoryReferencesFeature(context));
    this.addSettingTab(new LearningSettingsTab(this.app, this, context));
    this.addCommand({
      id: "check-textbook-references",
      name: "检查当前笔记的教材引用",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) return false;
        if (!checking) {
          const document = references.documents.parse(view.file.path, view.editor.getValue());
          const issues = document.issues.map((issue) => `第 ${issue.line} 行：${issue.message}`);
          new Notice(`有效教材引用 ${document.citations.size} 个，正文标记 ${document.occurrences.length} 个。${issues.length ? "\n" + issues.join("\n") : "\n引用数据检查通过。"}`, issues.length ? 10000 : 5000);
        }
        return true;
      }
    });
  }
}
