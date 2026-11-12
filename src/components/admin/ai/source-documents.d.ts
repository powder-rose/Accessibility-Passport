export interface ExtractedDocument {
  name: string;
  kind: string;
  text: string;
  truncated: boolean;
  pages?: number;
  pagesProcessed?: number;
  emptyPages?: number;
}
export function extractSourceDocument(file: File): Promise<ExtractedDocument>;
