import type { SiteContent } from './lib/content-types';
import type { ServicePageContent } from './lib/service-page-types';
import type { DocumentServiceId } from './lib/routes';
import type { ArticleRecord, ArticleSummary } from './features/articles/model';
import type { ArticleListing } from './features/articles/listing';
export interface LegalDocument {
  title: string;
  lines: string[];
}
export interface PageData {
  route:
    | 'home'
    | DocumentServiceId
    | 'legal'
    | 'admin'
    | 'blog'
    | 'article'
    | 'not-found';
  article?: ArticleRecord;
  blog?: ArticleListing;
  relatedArticles?: ArticleSummary[];
  adminPath?: string;
  content: SiteContent;
  document?: LegalDocument;
  servicePage?: ServicePageContent;
  objectType?: string;
  service?: string;
}
