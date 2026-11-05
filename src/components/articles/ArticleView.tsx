import type { ArticleRecord, ArticleSummary } from '@/features/articles/model';
import { articleDate } from '@/features/articles/model';
import { Arrow } from '../site/primitives';

// HTML is sanitized on write, read, and by the authenticated preview endpoint.
export default function ArticleView({
  article,
  related = [],
  preview = false,
}: {
  article: ArticleRecord;
  related?: ArticleSummary[];
  preview?: boolean;
}) {
  return (
    <>
      <article className="article-view" id="article-top">
        <header className="container article-view__header">
          <nav
            className="article-breadcrumbs"
            aria-label="Навигационная цепочка"
          >
            <a href="/">Главная</a>
            <span>/</span>
            <a href="/blog/">Блог</a>
            <span>/</span>
            <span aria-current="page">
              {article.title || 'Заголовок статьи'}
            </span>
          </nav>
          <p className="eyebrow">
            {preview ? 'Предпросмотр статьи' : 'Блог Николая Бойкова'}
          </p>
          <h1>{article.title || 'Заголовок статьи'}</h1>
          <div className="article-view__meta">
            <span>Николай Бойков</span>
            {article.category && <span>{article.category}</span>}
            <time dateTime={article.publishedAt || article.createdAt}>
              {articleDate(article.publishedAt || article.createdAt)}
            </time>
          </div>
        </header>
        {article.image && (
          <figure className="container article-view__cover">
            <img
              src={article.image}
              alt={article.imageAlt}
              width={1200}
              height={675}
              fetchPriority="high"
            />
          </figure>
        )}
        <div
          className="article-prose"
          dangerouslySetInnerHTML={{ __html: article.content }}
        />
        {!article.content && preview && (
          <p className="article-view__empty">Здесь появится текст статьи.</p>
        )}
      </article>
      {!!related.length && (
        <section className="section article-related">
          <div className="container">
            <p className="eyebrow">Читать дальше</p>
            <h2>Полезные статьи</h2>
            <div className="blog-grid">
              {related.slice(0, 3).map((item) => (
                <ArticleCard key={item.id} article={item} heading="h3" />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
export function ArticleCard({
  article,
  heading = 'h2',
}: {
  article: ArticleSummary;
  heading?: 'h2' | 'h3';
}) {
  const Title = heading;
  return (
    <article className="blog-card">
      <a
        href={`/blog/${article.slug}/`}
        className="blog-card__image"
        tabIndex={-1}
        aria-hidden="true"
      >
        {article.image ? (
          <img
            src={article.image}
            alt=""
            width={640}
            height={360}
            loading="lazy"
          />
        ) : (
          <span>БОЙКОВГРУПП</span>
        )}
      </a>
      <div className="blog-card__body">
        <div className="blog-card__meta">
          {article.category && <span>{article.category}</span>}
          <time dateTime={article.publishedAt || article.createdAt}>
            {articleDate(article.publishedAt || article.createdAt)}
          </time>
        </div>
        <Title>
          <a href={`/blog/${article.slug}/`}>{article.title}</a>
        </Title>
        <p>{article.seoDescription}</p>
        <a className="text-link" href={`/blog/${article.slug}/`}>
          Читать
          <Arrow />
        </a>
      </div>
    </article>
  );
}
