import type { PdfReference } from "../../core/pdf/types";

export interface TextbookReference extends PdfReference {
  printed_page?: string;
}

export interface Citation {
  key: string;
  id: string;
  label: string;
  reference: TextbookReference;
  from: number;
  to: number;
  line: number;
  legacy: boolean;
}

export interface CitationOccurrence {
  from: number;
  to: number;
  citation: Citation;
}

export interface CitationDocument {
  citations: Map<string, Citation>;
  occurrences: CitationOccurrence[];
  issues: { line: number; message: string }[];
  footnoteOrder: string[];
  legacyMarkers: { from: number; to: number; id: string; citation?: Citation }[];
}
