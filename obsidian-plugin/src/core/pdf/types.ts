export interface PdfReference {
  source_sha256: string;
  source_uri: string;
  pdf_page: number;
  pdf_page_end?: number;
  locator?: string;
  quote?: string;
}
