import { MarkdownView, PluginSettingTab, Setting, type App, type Plugin } from "obsidian";
import type { FeatureContext } from "./core/feature";

export class LearningSettingsTab extends PluginSettingTab {
  constructor(app: App, plugin: Plugin, private context: FeatureContext) { super(app, plugin); }
  display(): void {
    const { containerEl, context } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Foresight" });
    containerEl.createEl("h3", { text: "教材引用" });
    new Setting(containerEl).setName("显示教材注解").setDesc("在阅读视图和实时预览中，将教材引用显示为可点击的原书标签。")
      .addToggle((toggle) => toggle.setValue(context.settings.textbookReferences.enabled).onChange(async (value) => {
        context.settings.textbookReferences.enabled = value;
        await context.saveSettings();
        this.app.workspace.updateOptions();
        for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
          if (leaf.view instanceof MarkdownView) leaf.view.previewMode.rerender(true);
        }
      }));
    new Setting(containerEl).setName("在旁边打开教材").setDesc("保留课程笔记，与原文并排阅读；后续引用复用已打开的 PDF。")
      .addToggle((toggle) => toggle.setValue(context.settings.textbookReferences.openInSplit).onChange(async (value) => {
        context.settings.textbookReferences.openInSplit = value;
        await context.saveSettings();
      }));
    containerEl.createEl("p", { text: "点击标签打开原文；Ctrl / Cmd + 点击在新标签页打开。右键可查看引用详情或绑定移动后的教材。" });
    containerEl.createEl("h3", { text: "历史学习引用" });
    new Setting(containerEl).setName("显示学习回顾").setDesc("悬停回顾标签查看原讲解、题目与实际回答；点击精确定位转录记录。")
      .addToggle((toggle) => toggle.setValue(context.settings.historyReferences.enabled).onChange(async (value) => {
        context.settings.historyReferences.enabled = value;
        await context.saveSettings();
        this.app.workspace.updateOptions();
        for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
          if (leaf.view instanceof MarkdownView) leaf.view.previewMode.rerender(true);
        }
      }));
    if (Object.keys(context.settings.pdfBindings).length) {
      containerEl.createEl("h3", { text: "已绑定教材" });
      for (const [fingerprint, path] of Object.entries(context.settings.pdfBindings)) {
        new Setting(containerEl).setName(path).addButton((button) => button.setButtonText("解除绑定").onClick(async () => {
          delete context.settings.pdfBindings[fingerprint];
          await context.saveSettings();
          this.display();
        }));
      }
    }
  }
}
