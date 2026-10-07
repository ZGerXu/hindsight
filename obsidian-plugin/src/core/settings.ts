export interface LearningSettings {
  textbookReferences: { enabled: boolean; openInSplit: boolean };
  historyReferences: { enabled: boolean };
  pdfBindings: Record<string, string>;
}

export function loadSettings(data: Partial<LearningSettings> | null): LearningSettings {
  return {
    textbookReferences: { enabled: true, openInSplit: true, ...data?.textbookReferences },
    historyReferences: { enabled: true, ...data?.historyReferences },
    pdfBindings: { ...data?.pdfBindings }
  };
}
