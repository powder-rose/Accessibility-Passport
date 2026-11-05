import type { ReactNode } from 'react';
import type { SectionViewProps } from '../service/presentation-types';
import { Heading, Note } from '../site/primitives';
import ServiceGlyph from '../service/ServiceGlyph';

export default function QuestionnaireRegulations({
  section,
  children,
}: SectionViewProps & { children: ReactNode }) {
  return (
    <section className="section questionnaire-regulations" id="regulations">
      <div className="container">
        <Heading section={section} />
        <div className="questionnaire-regulations__grid">
          {section.items?.map((item, index) => (
            <article
              className="questionnaire-regulations__item reveal"
              key={item.title}
            >
              {index === 0 && (
                <span
                  className="questionnaire-regulations__reference"
                  aria-hidden="true"
                >
                  А.3
                </span>
              )}
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
