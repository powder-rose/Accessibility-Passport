import type { SiteContent } from '@/lib/content-types';
import ArticlesList from './ArticlesList';
import ArticleEdit from './ArticleEdit';
import ArticlePreview from './ArticlePreview';
import '../../../styles/admin-articles.css';

export default function ArticlesWorkspace({
  path,
  site,
}: {
  path: string;
  site: SiteContent['site'];
}) {
  if (path === '/admin/articles/preview/')
    return <ArticlePreview site={site} />;
  const id = path.match(/^\/admin\/articles\/edit\/([a-f0-9-]{36})\/$/)?.[1];
  if (path === '/admin/articles/new/' || id) return <ArticleEdit id={id} />;
  return <ArticlesList />;
}
