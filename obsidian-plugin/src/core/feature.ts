import type { Plugin } from "obsidian";
import type { LearningSettings } from "./settings";
import type { PdfNavigator } from "./pdf/navigator";

// Shared services are passed explicitly. Each feature owns its registrations and lifecycle.
export interface FeatureContext {
  plugin: Plugin;
  settings: LearningSettings;
  pdf: PdfNavigator;
  saveSettings(): Promise<void>;
}
