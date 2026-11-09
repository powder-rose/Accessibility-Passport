import type { DatabaseSync } from 'node:sqlite';
import type {
  ArticleRecord,
  ArticleSummary,
} from '../../src/features/articles/model';
import {
  articlePageSize,
  type AdminArticleSummary,
  type ArticleListing,
  type ArticleQuery,
} from '../../src/features/articles/listing';

const projection = `id,slug,status,category,revision,
  json_extract(payload,'$.title') AS title,
  json_extract(payload,'$.image') AS image,
  json_extract(payload,'$.imageAlt') AS imageAlt,
  json_extract(payload,'$.seoTitle') AS seoTitle,
  json_extract(payload,'$.seoDescription') AS seoDescription,
  created_at AS createdAt,updated_at AS updatedAt,published_at AS publishedAt`;
const order = 'COALESCE(published_at,created_at) DESC,id';
const published = "deleted_at IS NULL AND status='published'";
const publicSummary = ({
  revision: _revision,
  ...summary
}: AdminArticleSummary): ArticleSummary => summary;

export class ArticleQueries {
  constructor(private readonly db: DatabaseSync) {
    db.function('article_fold', { deterministic: true }, (value) =>
      typeof value === 'string' ? value.toLocaleLowerCase('ru') : '',
    );
  }
  publishedSlugs(): string[] {
    return (
      this.db
        .prepare(
          `SELECT slug FROM articles WHERE ${published} ORDER BY ${order}`,
        )
        .all() as { slug: string }[]
    ).map((row) => row.slug);
  }
  categories(publicOnly = false): string[] {
    return (
      this.db
        .prepare(
          `SELECT DISTINCT category FROM articles WHERE ${publicOnly ? published : 'deleted_at IS NULL'} AND category<>''`,
        )
        .all() as { category: string }[]
    )
      .map((row) => row.category)
      .sort((a, b) => a.localeCompare(b, 'ru'));
  }
  private page(
    query: ArticleQuery,
    admin: boolean,
  ): ArticleListing<AdminArticleSummary> {
    const conditions = ['deleted_at IS NULL'];
    const parameters: string[] = [];
    const status = admin ? query.status : 'published';
    if (status !== 'all') {
      conditions.push('status=?');
      parameters.push(status);
    }
    if (query.category) {
      conditions.push('category=?');
      parameters.push(query.category);
    }
    if (query.search) {
      conditions.push(
        `instr(article_fold(COALESCE(json_extract(payload,'$.title'),'') || ' ' || ${admin ? 'category' : "COALESCE(json_extract(payload,'$.seoDescription'),'')"}),?)>0`,
      );
      parameters.push(query.search.toLocaleLowerCase('ru'));
    }
    const where = conditions.join(' AND ');
    const { total } = this.db
      .prepare(`SELECT COUNT(*) AS total FROM articles WHERE ${where}`)
      .get(...parameters) as { total: number };
    const pageSize = admin ? articlePageSize.admin : articlePageSize.public;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = admin ? Math.min(query.page, pages) : query.page;
    const articles =
      page > pages
        ? []
        : (this.db
            .prepare(
              `SELECT ${projection} FROM articles WHERE id IN
                (SELECT id FROM articles WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?)
                ORDER BY ${order}`,
            )
            .all(
              ...parameters,
              pageSize,
              (page - 1) * pageSize,
            ) as unknown as AdminArticleSummary[]);
    return {
      ...query,
      status,
      page,
      articles,
      categories: this.categories(!admin),
      total,
      pages,
      pageSize,
    };
  }
  publicPage(query: ArticleQuery): ArticleListing {
    const result = this.page(query, false);
    return { ...result, articles: result.articles.map(publicSummary) };
  }
  adminPage(query: ArticleQuery) {
    return this.page(query, true);
  }
  related(article: Pick<ArticleRecord, 'id' | 'category'>): ArticleSummary[] {
    return (
      this.db
        .prepare(
          `SELECT ${projection} FROM articles WHERE id IN
            (SELECT id FROM articles WHERE ${published} AND id<>? ORDER BY (category=?) DESC,${order} LIMIT 3)
            ORDER BY (category=?) DESC,${order}`,
        )
        .all(
          article.id,
          article.category,
          article.category,
        ) as unknown as AdminArticleSummary[]
    ).map(publicSummary);
  }
}
