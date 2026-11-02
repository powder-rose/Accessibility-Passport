import type { SiteContent } from './lib/content-types';
export interface LegalDocument {
  title: string;
  lines: string[];
}
export interface PageData {
  route: 'home' | 'legal' | 'admin' | 'not-found';
  content: SiteContent;
  document?: LegalDocument;
  objectType?: string;
  service?: string;
}
