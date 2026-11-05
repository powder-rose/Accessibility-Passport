import { useState } from 'react';
import type { PageData } from '../page-data';
import Header from '../components/site/Header';
import Footer from '../components/site/Footer';
import Interactions from '../components/site/Interactions';
import { ArticleCard } from '../components/articles/ArticleView';

export default function BlogPage({ content, articles = [] }: PageData) {
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const categories = [
    ...new Set(articles.map((article) => article.category).filter(Boolean)),
  ];
  const visible = articles.filter(
    (article) =>
      (!category || article.category === category) &&
      (article.title + ' ' + article.seoDescription)
        .toLocaleLowerCase('ru')
        .includes(search.toLocaleLowerCase('ru')),
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
          {!!articles.length && (
            <div className="blog-controls">
              <div aria-label="Категории статей">
                <button
                  type="button"
                  aria-pressed={!category}
                  onClick={() => setCategory('')}
                >
                  Все статьи
                </button>
                {categories.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={category === item}
                    onClick={() => setCategory(item)}
                  >
                    {item}
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
          )}
          <div className="blog-grid">
            {visible.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
          {!visible.length && (
            <p className="blog-empty" role="status">
              {articles.length
                ? 'По вашему запросу ничего не найдено.'
                : 'Статьи пока не опубликованы.'}
            </p>
          )}
        </div>
      </main>
      <Footer site={content.site} />
      <Interactions metrikaId={content.site.metrikaId} />
    </>
  );
}
