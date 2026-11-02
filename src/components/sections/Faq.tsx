import type { Section } from '@/lib/content-types';
export default function Faq({ section }: { section: Section }) {
  return (
    <section className="section faq" id="faq">
      <div className="container faq-grid">
        <div className="faq-heading">
          <p className="eyebrow">{section.eyebrow}</p>
          <h2>{section.title}</h2>
          <a className="text-link" href="#contact">
            Обсудить объект<span aria-hidden="true">↗</span>
          </a>
        </div>
        <div className="faq-list">
          {section.items?.map((x, i) => (
            <details className="faq-item" key={x.title}>
              <summary>
                <span className="faq-index">{String(i + 1).padStart(2, '0')}</span>
                <h3>{x.title}</h3>
                <span className="faq-plus" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="faq-answer">
                <p>{x.text}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
