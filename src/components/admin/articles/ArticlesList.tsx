import { useEffect, useState } from 'react';
import {
  articleDate,
  articleFormSchema,
  type ArticleRecord,
} from '@/features/articles/model';
import { articleRequest, saveArticle } from './api';
import { createRequestId } from '@/lib/request-id';

export default function ArticlesList() {
  const [articles, setArticles] = useState<ArticleRecord[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');
  async function load() {
    setError('');
    setLoading(true);
    try {
      const result = await articleRequest<{
        articles: ArticleRecord[];
        categories: string[];
      }>('/api/admin/articles');
      setArticles(result.articles);
      setCategories(result.categories);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Не удалось загрузить статьи.',
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function category(article: ArticleRecord, value: string) {
    const next = value.trim().replace(/\s+/g, ' ');
    if (next === article.category) return true;
    setPending(article.id);
    setError('');
    try {
      const result = await saveArticle(
        { ...articleFormSchema.parse(article), category: next },
        createRequestId(),
        article,
      );
      setArticles((items) =>
        items.map((item) => (item.id === article.id ? result.article : item)),
      );
      setCategories((items) => [...new Set([...items, next].filter(Boolean))]);
      return true;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Не удалось изменить категорию.',
      );
      return false;
    } finally {
      setPending('');
    }
  }
  async function remove(article: ArticleRecord) {
    if (!window.confirm('Удалить статью?')) return;
    setPending(article.id);
    setError('');
    try {
      await articleRequest(
        '/api/admin/articles/' + article.id + '?revision=' + article.revision,
        { method: 'DELETE' },
      );
      setArticles((items) => items.filter((item) => item.id !== article.id));
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Не удалось удалить статью.',
      );
    } finally {
      setPending('');
    }
  }
  const visible = articles.filter(
    (article) =>
      (filter === 'all' || article.status === filter) &&
      (article.title + ' ' + article.category)
        .toLocaleLowerCase('ru')
        .includes(search.toLocaleLowerCase('ru')),
  );
  return (
    <div>
      <div className="article-admin-heading">
        <div>
          <p className="eyebrow">Блог Николая Бойкова</p>
          <h1>Статьи</h1>
        </div>
        <a className="button button-contrast" href="/admin/articles/new/?fresh=1">
          Создать статью ↗
        </a>
      </div>
      <div className="article-admin-filters">
        <div role="group" aria-label="Статус статьи">
          {[
            ['all', 'Все'],
            ['published', 'Опубликованные'],
            ['draft', 'Черновики'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          Поиск по статьям
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Загрузка…</p>
      ) : (
        <>
          {!visible.length && (
            <p className="article-admin-empty">
              {articles.length
                ? 'По вашему запросу ничего не найдено.'
                : 'Статей пока нет.'}
            </p>
          )}
          <datalist id="list-article-categories">
            {categories.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
          <div className="article-admin-list">
            {visible.map((article) => (
              <article className="article-admin-item" key={article.id}>
                <div className="article-admin-item__image">
                  {article.image ? (
                    <img src={article.image} alt="" width={320} height={180} />
                  ) : (
                    <span>БОЙКОВГРУПП</span>
                  )}
                </div>
                <div className="article-admin-item__copy">
                  <span
                    className={
                      'article-status article-status--' + article.status
                    }
                  >
                    {article.status === 'published'
                      ? 'Опубликовано'
                      : 'Черновик'}
                  </span>
                  <h2>{article.title || 'Без названия'}</h2>
                  <label>
                    Категория
                    <input
                      key={article.category}
                      defaultValue={article.category}
                      list="list-article-categories"
                      maxLength={80}
                      disabled={!!pending}
                      onBlur={async (event) => {
                        const input = event.currentTarget;
                        const saved = await category(article, input.value);
                        if (!saved) input.value = article.category;
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  </label>
                  <small>Создано: {articleDate(article.createdAt)}</small>
                </div>
                <div className="article-admin-item__actions">
                  <a href={'/admin/articles/edit/' + article.id + '/'}>
                    Редактировать
                  </a>
                  {article.status === 'published' && (
                    <a
                      href={'/blog/' + article.slug + '/'}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Открыть на сайте ↗
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={!!pending}
                    onClick={() => remove(article)}
                  >
                    Удалить
                  </button>
                </div>
              </article>
            ))}
          </div>
          {error && (
            <button type="button" className="article-retry" onClick={load}>
              Обновить список
            </button>
          )}
        </>
      )}
    </div>
  );
}
