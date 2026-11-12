import type { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import {
  articleSlug,
  type ArticleForm,
  type ArticleRecord,
} from '../../src/features/articles/model';
import { articleText, imageReferences, sanitizeArticleContent } from './html';
import { storageLimits } from '../../src/lib/storage';
import { ArticleQueries } from './queries';
import { inImmediateTransaction } from '../db/transaction';

export class ArticleError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
interface Row {
  id: string;
  slug: string;
  status: 'draft' | 'published';
  category: string;
  payload: string;
  revision: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  deleted_at: string | null;
  request_hash: string;
}
export class ArticleRepository {
  readonly queries: ArticleQueries;
  constructor(private readonly db: DatabaseSync) {
    this.queries = new ArticleQueries(db);
  }
  private record(row: Row): ArticleRecord {
    const form = JSON.parse(row.payload) as ArticleForm;
    return {
      ...form,
      content: sanitizeArticleContent(form.content),
      id: row.id,
      slug: row.slug,
      status: row.status,
      category: row.category,
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
    };
  }
  get(id: string) {
    const row = this.db
      .prepare('SELECT * FROM articles WHERE id=? AND deleted_at IS NULL')
      .get(id) as Row | undefined;
    return row ? this.record(row) : undefined;
  }
  // Full records for maintenance; HTTP lists and SSR use the bounded queries.
  list(publishedOnly = false) {
    const rows = this.db
      .prepare(
        'SELECT * FROM articles WHERE deleted_at IS NULL' +
          (publishedOnly ? " AND status='published'" : '') +
          ' ORDER BY COALESCE(published_at,created_at) DESC, id',
      )
      .all() as unknown as Row[];
    return rows.map((row) => this.record(row));
  }
  bySlug(slug: string) {
    const row = this.db
      .prepare(
        "SELECT a.* FROM articles a JOIN article_slugs s ON s.article_id=a.id WHERE s.slug=? AND a.deleted_at IS NULL AND a.status='published'",
      )
      .get(slug) as Row | undefined;
    return row ? this.record(row) : undefined;
  }
  private uniqueSlug(value: string, exclude?: string) {
    const base = articleSlug(value) || 'article';
    let slug = base;
    let index = 2;
    while (
      this.db
        .prepare('SELECT 1 FROM article_slugs WHERE slug=? AND article_id<>?')
        .get(slug, exclude || '')
    )
      slug = base + '-' + index++;
    return slug;
  }
  prepare(input: ArticleForm) {
    const form = { ...input, content: sanitizeArticleContent(input.content) };
    if (
      form.status === 'published' &&
      (!form.title ||
        !articleText(form.content) ||
        !form.seoTitle ||
        !form.seoDescription)
    )
      throw new ArticleError(
        'Для публикации заполните заголовок, текст, SEO Title и SEO Description.',
      );
    if (form.status === 'published' && form.image && !form.imageAlt)
      throw new ArticleError('Добавьте Alt главного изображения.');
    for (const id of imageReferences(form.content, form.image))
      if (!this.db.prepare('SELECT 1 FROM article_images WHERE id=?').get(id))
        throw new ArticleError(
          'Изображение не найдено. Загрузите его повторно.',
        );
    return form;
  }
  private syncImages(id: string, form: ArticleForm) {
    this.db
      .prepare('DELETE FROM article_image_refs WHERE article_id=?')
      .run(id);
    const insert = this.db.prepare(
      'INSERT INTO article_image_refs(article_id,image_id) VALUES (?,?)',
    );
    for (const image of imageReferences(form.content, form.image))
      insert.run(id, image);
  }
  save(
    input: ArticleForm,
    {
      id,
      revision,
      requestId,
    }: { id?: string; revision?: number; requestId?: string },
  ) {
    return inImmediateTransaction(this.db, () => {
      const form = this.prepare(input);
      const hash = createHash('sha256')
        .update(JSON.stringify(form))
        .digest('hex');
      if (!id && requestId) {
        const retry = this.db
          .prepare('SELECT * FROM articles WHERE request_id=?')
          .get(requestId) as Row | undefined;
        if (retry) {
          if (retry.request_hash !== hash || retry.deleted_at)
            throw new ArticleError(
              'Данные запроса изменились. Обновите список статей.',
              409,
            );
          return this.record(retry);
        }
      }
      const previous = id ? this.get(id) : undefined;
      if (id && !previous) throw new ArticleError('Статья не найдена.', 404);
      if (previous && previous.revision !== revision)
        throw new ArticleError(
          'Статья изменена в другой вкладке. Ваши поля сохранены; откройте актуальную версию отдельно и перенесите изменения.',
          409,
        );
      const articleId = id || randomUUID();
      const slug =
        previous && form.slug === previous.slug
          ? previous.slug
          : this.uniqueSlug(
              form.slug || (previous ? previous.slug : form.title),
              articleId,
            );
      const now = new Date().toISOString();
      const publishedAt =
        previous?.publishedAt || (form.status === 'published' ? now : null);
      if (previous)
        this.db
          .prepare(
            'UPDATE articles SET slug=?,status=?,category=?,payload=?,revision=revision+1,updated_at=?,published_at=? WHERE id=?',
          )
          .run(
            slug,
            form.status,
            form.category,
            JSON.stringify({ ...form, slug }),
            now,
            publishedAt,
            articleId,
          );
      else
        this.db
          .prepare(
            'INSERT INTO articles(id,request_id,request_hash,slug,status,category,payload,revision,created_at,updated_at,published_at) VALUES (?,?,?,?,?,?,?,1,?,?,?)',
          )
          .run(
            articleId,
            requestId!,
            hash,
            slug,
            form.status,
            form.category,
            JSON.stringify({ ...form, slug }),
            now,
            now,
            publishedAt,
          );
      this.db
        .prepare(
          'INSERT OR IGNORE INTO article_slugs(slug,article_id) VALUES (?,?)',
        )
        .run(slug, articleId);
      this.syncImages(articleId, form);
      const saved = this.get(articleId)!;
      return saved;
    });
  }
  remove(id: string, revision: number) {
    const article = this.get(id);
    if (!article) throw new ArticleError('Статья не найдена.', 404);
    const result = this.db
      .prepare(
        'UPDATE articles SET deleted_at=?,revision=revision+1 WHERE id=? AND revision=? AND deleted_at IS NULL',
      )
      .run(new Date().toISOString(), id, revision);
    if (!result.changes)
      throw new ArticleError('Статья уже изменена. Обновите список.', 409);
  }
  addImage(bytes: Buffer, width: number, height: number, seoName?: string) {
    return inImmediateTransaction(this.db, () => {
      const used = this.db
        .prepare('SELECT COALESCE(SUM(size),0) AS size FROM article_images')
        .get() as { size: number };
      if (used.size + bytes.length > storageLimits.images)
        throw new ArticleError(
          'Хранилище изображений заполнено. Обратитесь к администратору.',
          503,
        );
      let id: string = randomUUID();
      if (seoName !== undefined) {
        // The database key itself is the filename. This keeps all image
        // references and old UUID-based URLs compatible without a migration.
        const base = articleSlug(seoName.replace(/\.(?:jpe?g|png|webp)$/i, ''))
          .slice(0, 120)
          .replace(/-+$/, '');
        if (!base)
          throw new ArticleError('Укажите понятное название изображения.');
        const exists = this.db.prepare(
          'SELECT 1 FROM article_images WHERE id=?',
        );
        id = base;
        let suffix = 2;
        while (exists.get(id)) {
          if (suffix > 10000)
            throw new ArticleError(
              'Не удалось подобрать уникальное имя изображения.',
            );
          id = base + '-' + suffix++;
        }
      }
      this.db
        .prepare('INSERT INTO article_images VALUES (?,?,?,?,?,?,?)')
        .run(
          id,
          bytes,
          width,
          height,
          bytes.length,
          createHash('sha256').update(bytes).digest('hex'),
          new Date().toISOString(),
        );
      return { url: '/media/articles/' + id + '.webp', width, height };
    });
  }
  imageMetadata(id: string) {
    return this.db
      .prepare(
        `SELECT i.size,i.sha256,EXISTS(
          SELECT 1 FROM article_image_refs r JOIN articles a ON a.id=r.article_id
          WHERE r.image_id=i.id AND a.status='published' AND a.deleted_at IS NULL
        ) AS published FROM article_images i WHERE i.id=?`,
      )
      .get(id) as
      { size: number; sha256: string; published: number } | undefined;
  }
  image(id: string) {
    return this.db
      .prepare('SELECT bytes,sha256 FROM article_images WHERE id=?')
      .get(id) as { bytes: Uint8Array; sha256: string } | undefined;
  }
}
