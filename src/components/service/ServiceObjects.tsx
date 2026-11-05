import type { ServiceSection } from '@/lib/service-page-types';
import { Heading, OrderLink } from '../site/primitives';
import ObjectCards from '../site/ObjectCards';
import QuizLink from '../site/QuizLink';
export default function ServiceObjects({
  section,
  service,
}: {
  section: ServiceSection;
  service: string;
}) {
  return (
    <section className="section objects" id="objects">
      <div className="container">
        <Heading section={section} />
        <ObjectCards
          items={section.items || []}
          service={service}
          actionLabel="Проверить объект"
        />
        <div className="section-cta">
          <div>
            <h3>{section.noteTitle}</h3>
            <p>{section.note}</p>
          </div>
          {section.actionType === 'order' ? (
            <OrderLink service={service}>{section.action}</OrderLink>
          ) : (
            <QuizLink service={service}>{section.action}</QuizLink>
          )}
        </div>
      </div>
    </section>
  );
}
