import { useState } from 'react';
import type { PageData } from '../page-data';
import Header from '../components/site/Header';
import Footer from '../components/site/Footer';
import Interactions from '../components/site/Interactions';
import { ArticleCard } from '../components/articles/ArticleView';
import { blogPath } from '../features/articles/listing';

export default function BlogPage({ content, blog }: PageData) {
  const [search, setSearch] = useState(blog?.search || '');
  if (!blog) throw new Error('Blog listing is missing.');
  const { category, categories, articles } = blog;
  const chooseCategory = (value: string) =>
    location.assign(
      blogPath({ ...blog, page: 1, category: value, search: search.trim() }),
    );
  return (
    <>
      <a className="skip-link" href="#main-content">
        К содержанию
      </a>
      <Header site={content.site} />
      <main className="blog-page" id="main-content">
        <div className="container">
          <header className="blog-header">
            <p className="eyebrow">БОЙКОВГРУПП</p>
            <h1>Блог Николая Бойкова</h1>
          </header>
          {(!!categories.length || !!blog.search || !!category) && (
            <div className="blog-controls">
              <div aria-label="Категории статей">
                <button
                  type="button"
                  aria-pressed={!category}
                  onClick={() => chooseCategory('')}
                >
                  Все статьи
                </button>
                {categories.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={category === item}
                    onClick={() => chooseCategory(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <form action="/blog/" method="get">
                {category && (
                  <input type="hidden" name="category" value={category} />
                )}
                <label>
                  Поиск по статьям
                  <input
                    type="search"
                    name="q"
                    maxLength={100}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                <button type="submit">Найти</button>
              </form>
            </div>
          )}
          <div className="blog-grid">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
          {!articles.length && (
            <p className="blog-empty" role="status">
              {blog.search || category
                ? 'По вашему запросу ничего не найдено.'
                : 'Статьи пока не опубликованы.'}
            </p>
          )}
          {blog.pages > 1 && (
            <nav className="blog-controls" aria-label="Страницы блога">
              {blog.page > 1 && (
                <a
                  className="text-link"
                  href={blogPath({ ...blog, page: blog.page - 1 })}
                >
                  ← Назад
                </a>
              )}
              <p>
                Страница {blog.page} из {blog.pages}
              </p>
              {blog.page < blog.pages && (
                <a
                  className="text-link"
                  href={blogPath({ ...blog, page: blog.page + 1 })}
                >
                  Далее →
                </a>
              )}
              {blog.page > 2 && (
                <a className="text-link" href={blogPath({ ...blog, page: 1 })}>
                  К началу списка
                </a>
              )}
            </nav>
          )}
        </div>
      </main>
      <Footer site={content.site} />
      <Interactions metrikaId={content.site.metrikaId} />
    </>
  );
}
