import type { ServiceSection } from '@/lib/service-page-types';
import { Heading, Arrow } from '../site/primitives';
import ServiceGlyph from './ServiceGlyph';
export default function ServiceComparison({ section }: { section: ServiceSection }) {
  return (
    <section className="section service-comparison">
      <div className="container">
        <Heading section={section} />
        <div className="service-comparison__grid">
          {section.items?.map((item, index) => (
            <article className="reveal" key={item.title}>
              <ServiceGlyph name={index === 0 ? 'document' : index === 1 ? 'check' : 'building'} />
              <h3>
                {index === 1 ? (
                  <a className="service-title-link" href="/">
                    {item.title}
                  </a>
                ) : (
                  item.title
                )}
              </h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
        <ol className="service-flow">
          {section.flow?.map((text, index) => (
            <li key={text}>
              <span>{text}</span>
              {index < (section.flow?.length || 0) - 1 && <Arrow diagonal={false} />}
            </li>
          ))}
        </ol>
        <p className="service-comparison__note">{section.note}</p>
      </div>
    </section>
  );
}
