export interface LearningSettings {
  textbookReferences: { enabled: boolean; openInSplit: boolean };
  pdfBindings: Record<string, string>;
}

export function loadSettings(data: Partial<LearningSettings> | null): LearningSettings {
  return {
    textbookReferences: { enabled: true, openInSplit: true, ...data?.textbookReferences },
    pdfBindings: { ...data?.pdfBindings }
  };
}
