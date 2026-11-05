import type { ServiceSection } from '@/lib/service-page-types';
import { Heading, Note } from '../site/primitives';
import ServiceGlyph from '../service/ServiceGlyph';
import UpdateAction from './UpdateAction';

export default function UpdateCards({
  section,
  id,
  variant,
}: {
  section: ServiceSection;
  id: string;
  variant: 'reasons' | 'audit' | 'scope';
}) {
  return (
    <section
      className={`section update-cards update-cards--${variant}`}
      id={id}
    >
      <div className="container">
        <Heading section={section} />
        <ol className="update-cards__grid">
          {section.items?.map((item, index) => (
            <li key={item.title} className="reveal">
              <span className="update-index">
                {String(index + 1).padStart(2, '0')}
              </span>
              {variant === 'audit' && (
                <ServiceGlyph
                  name={
                    (['document', 'building', 'people', 'check'] as const)[
                      index % 4
                    ]
                  }
                />
              )}
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </li>
          ))}
        </ol>
        {(section.note || section.action) && (
          <div className="update-cards__footer">
            {section.note && <Note>{section.note}</Note>}
            {section.noteTitle && <h3>{section.noteTitle}</h3>}
            {section.action && (
              <UpdateAction review quiz={variant === 'reasons'}>
                {section.action}
              </UpdateAction>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
