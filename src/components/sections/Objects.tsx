import type { Section } from '@/lib/content-types';
import { Heading, Arrow } from '../site/primitives';
export default function Objects({ section }: { section: Section }) {
  return (
    <section className="section objects" id="objects">
      <div className="container">
        <Heading section={section} />
        <div className="objects-grid">
          {section.items?.map((x, i) => (
            <article key={x.title} className="object-card reveal">
              <div className="object-image">
                <img src={x.image} alt={x.title} loading="lazy" width="360" height="240" />
                <span className="object-number">0{i + 1}</span>
              </div>
              <div className="object-copy">
                <h3>{x.title}</h3>
                <p>{x.text}</p>
                <a
                  className="text-link"
                  href={x.url || `?object_type=${x.objectType}#quiz`}
                  data-object={x.objectType}
                >
                  Подробнее
                  <Arrow />
                </a>
              </div>
            </article>
          ))}
        </div>
        <div className="section-cta">
          <p>{section.note}</p>
          <a href="#contact" className="text-link">
            Получить консультацию
            <Arrow />
          </a>
        </div>
      </div>
    </section>
  );
}
