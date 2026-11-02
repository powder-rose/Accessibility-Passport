import type { SiteContent } from './lib/content-types';
import type { ServicePageContent } from './lib/service-page-types';
export interface LegalDocument {
  title: string;
  lines: string[];
}
export interface PageData {
  route: 'home' | 'survey' | 'legal' | 'admin' | 'not-found';
  content: SiteContent;
  document?: LegalDocument;
  servicePage?: ServicePageContent;
  objectType?: string;
  service?: string;
}
