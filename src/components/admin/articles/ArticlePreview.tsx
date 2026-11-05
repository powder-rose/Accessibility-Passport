import { useEffect, useState } from 'react';
import type { SiteContent } from '@/lib/content-types';
import type { ArticleRecord } from '@/features/articles/model';
import { readArticlePreview } from './preview-storage';
import { articleJson, articleRequest } from './api';
import ArticleView from '../../articles/ArticleView';
import Header from '../../site/Header';
import Footer from '../../site/Footer';

export default function ArticlePreview({
  site,
}: {
  site: SiteContent['site'];
}) {
  const [article, setArticle] = useState<ArticleRecord>();
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const token = location.hash.slice(1);
        const form = readArticlePreview(token);
        const result = await articleRequest<{ article: ArticleRecord }>(
          '/api/admin/articles/preview',
          { ...articleJson('POST', form), signal: controller.signal },
        );
        setArticle(result.article);
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : 'Не удалось открыть предпросмотр.',
          );
      }
    }
    load();
    return () => controller.abort();
  }, []);
  return (
    <div className="article-preview-page">
      <div className="article-preview-bar">
        <span>Предпросмотр · статья не публикуется</span>
        <a href="/admin/articles/">К списку статей</a>
      </div>
      <Header site={site} />
      {article ? (
        <main>
          <ArticleView article={article} preview />
        </main>
      ) : (
        <p
          className="article-preview-loading"
          role={error ? 'alert' : 'status'}
        >
          {error || 'Загрузка предпросмотра…'}
        </p>
      )}
      <Footer site={site} />
    </div>
  );
}
