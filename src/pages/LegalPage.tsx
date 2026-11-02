import type { SiteContent } from '../lib/content-types';
import type { LegalDocument } from '../page-data';
import Header from '../components/site/Header';
import Footer from '../components/site/Footer';

export default function LegalPage({
  content,
  document,
}: {
  content: SiteContent;
  document: LegalDocument;
}) {
  return (
    <>
      <Header site={content.site} />
      <main className="container legal-page">
        <p className="eyebrow">{content.site.company}</p>
        <h1>{document.title}</h1>
        {document.lines.map((line, i) =>
          /^\d+\.\s/.test(line) ? <h2 key={i}>{line}</h2> : <p key={i}>{line}</p>,
        )}
        <a href="/" className="text-link">
          На главную ↗
        </a>
      </main>
      <Footer site={content.site} />
    </>
  );
}
