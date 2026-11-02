import type { Section, SiteContent } from '@/lib/content-types';
import { Heading, Arrow } from '../site/primitives';
export default function Trust({ section, site }: { section: Section; site: SiteContent['site'] }) {
  return (
    <section className="section trust" id="trust">
      <div className="container">
        <Heading section={section} />
        <div className="trust-grid">
          {section.items?.map((x, i) => (
            <article key={x.title} className="trust-item reveal">
              <span className="trust-sign" aria-hidden="true">
                {i === 0 ? '15+' : i === 1 ? 'ООО' : '↗'}
              </span>
              <h3>{x.title}</h3>
              <p>{x.text}</p>
              {x.action && (
                <a className="text-link" href="#requisites">
                  {x.action}
                  <Arrow />
                </a>
              )}
            </article>
          ))}
        </div>
        <details className="requisites" id="requisites">
          <summary>
            Реквизиты компании<span aria-hidden="true">+</span>
          </summary>
          <dl>
            <div>
              <dt>Наименование</dt>
              <dd>{site.company}</dd>
            </div>
            <div>
              <dt>ИНН</dt>
              <dd>{site.inn}</dd>
            </div>
            <div>
              <dt>ОГРН</dt>
              <dd>{site.ogrn}</dd>
            </div>
          </dl>
        </details>
      </div>
    </section>
  );
}
