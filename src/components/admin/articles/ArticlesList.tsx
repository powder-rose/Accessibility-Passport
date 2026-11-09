import { useState } from 'react';
import {
  articleDate,
  articleFormSchema,
  type ArticleRecord,
} from '@/features/articles/model';
import { articleRequest, saveArticle } from './api';
import { createRequestId } from '@/lib/request-id';
import type {
  AdminArticleSummary,
  ArticleQuery,
} from '@/features/articles/listing';
import { useArticleList } from './useArticleList';

export default function ArticlesList() {
  const list = useArticleList();
  const { loading, error, setError, search, setSearch, filter, setFilter } =
    list;
  const { articles, categories } = list.listing;
  const [pending, setPending] = useState('');
  async function category(article: AdminArticleSummary, value: string) {
    const next = value.trim().replace(/\s+/g, ' ');
    if (next === article.category) return true;
    setPending(article.id);
    setError('');
    try {
      const { article: current } = await articleRequest<{
        article: ArticleRecord;
      }>('/api/admin/articles/' + article.id);
      if (current.revision !== article.revision)
        throw new Error(
          'Статья изменена в другой вкладке. Обновите список перед изменением категории.',
        );
      await saveArticle(
        { ...articleFormSchema.parse(current), category: next },
        createRequestId(),
        current,
      );
      list.refresh();
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
  async function remove(article: AdminArticleSummary) {
    if (!window.confirm('Удалить статью?')) return;
    setPending(article.id);
    setError('');
    try {
      await articleRequest(
        '/api/admin/articles/' + article.id + '?revision=' + article.revision,
        { method: 'DELETE' },
      );
      list.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Не удалось удалить статью.',
      );
    } finally {
      setPending('');
    }
  }
  const visible = articles;
  return (
    <div>
      <div className="article-admin-heading">
        <div>
          <p className="eyebrow">Блог Николая Бойкова</p>
          <h1>Статьи</h1>
        </div>
        <a
          className="button button-contrast"
          href="/admin/articles/new/?fresh=1"
        >
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
              disabled={!!pending}
              onClick={() => setFilter(value as ArticleQuery['status'])}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          Поиск по статьям
          <input
            type="search"
            maxLength={100}
            disabled={!!pending}
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
      {error && !!articles.length && (
        <p>Показан последний успешно загруженный список.</p>
      )}
      {loading ? (
        <p role="status">Загрузка…</p>
      ) : (
        <>
          {!error && !visible.length && (
            <p className="article-admin-empty">
              {search || filter !== 'all'
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
            <button
              type="button"
              className="article-retry"
              onClick={list.refresh}
            >
              Обновить список
            </button>
          )}
          {list.listing.pages > 1 && (
            <nav className="cms-leads-pagination" aria-label="Страницы статей">
              <button
                type="button"
                className="cms-leads-button"
                disabled={!!pending || list.listing.page <= 1}
                onClick={() => list.go(list.listing.page - 1)}
              >
                Назад
              </button>
              <p>
                Страница {list.listing.page} из {list.listing.pages} · Всего:{' '}
                {list.listing.total}
              </p>
              <button
                type="button"
                className="cms-leads-button"
                disabled={!!pending || list.listing.page >= list.listing.pages}
                onClick={() => list.go(list.listing.page + 1)}
              >
                Далее
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
