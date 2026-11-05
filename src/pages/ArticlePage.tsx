import type { PageData } from '../page-data';
import Header from '../components/site/Header';
import Footer from '../components/site/Footer';
import Interactions from '../components/site/Interactions';
import ArticleView from '../components/articles/ArticleView';
import ContactSection from '../components/forms/ContactSection';

export default function ArticlePage({
  content,
  article,
  articles = [],
}: PageData) {
  if (!article) throw new Error('Article is missing.');
  const related = articles
    .filter((item) => item.id !== article.id)
    .sort(
      (a, b) =>
        Number(b.category === article.category) -
        Number(a.category === article.category),
    );
  return (
    <>
      <a className="skip-link" href="#main-content">
        К содержанию
      </a>
      <Header site={content.site} contactHref="#contact" />
      <main id="main-content">
        <ArticleView article={article} related={related} />
        <ContactSection content={content} />
      </main>
      <Footer site={content.site} topHref="#article-top" />
      <Interactions metrikaId={content.site.metrikaId} />
    </>
  );
}
