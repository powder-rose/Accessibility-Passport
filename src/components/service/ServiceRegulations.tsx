import type { ReactNode } from 'react';
import type { ServiceSection } from '@/lib/service-page-types';
import { Heading, Note } from '../site/primitives';
import ServiceGlyph from './ServiceGlyph';

export default function ServiceRegulations({
  section,
  children,
}: {
  section: ServiceSection;
  children: ReactNode;
}) {
  return (
    <section className="section service-regulations" id="regulations">
      <div className="container">
        <Heading section={section} />
        <div className="service-regulations__grid">
          {section.items?.map((item, index) => (
            <article
              className="service-regulations__card reveal"
              key={item.title}
            >
              <ServiceGlyph
                name={
                  (['document', 'people', 'building', 'check'] as const)[index]
                }
              />
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="service-regulations__footer">
          <Note>{section.note}</Note>
          {children}
        </div>
      </div>
    </section>
  );
}
