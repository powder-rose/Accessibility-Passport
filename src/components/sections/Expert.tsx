import type { Section, SiteContent } from '@/lib/content-types';
import { OrderLink } from '../site/primitives';
export default function Expert({
  section,
  site,
  service,
}: {
  section: Section;
  site: SiteContent['site'];
  service?: string;
}) {
  return (
    <section className="section expert" id="expert">
      <div className="container expert-grid">
        <figure className="expert-portrait">
          <img
            src={site.expertImage}
            alt="Николай Бойков, руководитель БОЙКОВГРУПП"
            loading="lazy"
            width="1649"
            height="2048"
          />
          <figcaption>
            <span>Николай Бойков</span>Руководитель БОЙКОВГРУПП
            <br />
            Эксперт по комплексной безопасности
          </figcaption>
        </figure>
        <div className="expert-copy">
          <p className="eyebrow">{section.eyebrow}</p>
          <h2>{section.title}</h2>
          <blockquote>«{section.quote}».</blockquote>
          <ol>
            {section.items?.map((x, i) => (
              <li key={x.title}>
                <span>0{i + 1}</span>
                <div>
                  <h3>{x.title}</h3>
                  <p>{x.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <OrderLink service={service}>Обсудить объект со специалистом</OrderLink>
        </div>
      </div>
    </section>
  );
}
