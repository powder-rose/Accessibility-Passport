import type { PageData } from '../page-data';
import Header from '../components/site/Header';
import Footer from '../components/site/Footer';
import Interactions from '../components/site/Interactions';
import ArticleView from '../components/articles/ArticleView';
import ContactSection from '../components/forms/ContactSection';

export default function ArticlePage({
  content,
  article,
  relatedArticles = [],
}: PageData) {
  if (!article) throw new Error('Article is missing.');
  return (
    <>
      <a className="skip-link" href="#main-content">
        К содержанию
      </a>
      <Header site={content.site} contactHref="#contact" />
      <main id="main-content">
        <ArticleView article={article} related={relatedArticles} />
        <ContactSection content={content} />
      </main>
      <Footer site={content.site} topHref="#article-top" />
      <Interactions metrikaId={content.site.metrikaId} />
    </>
  );
}
