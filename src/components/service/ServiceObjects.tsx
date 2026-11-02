import type { ServiceSection } from '@/lib/service-page-types';
import { Heading } from '../site/primitives';
import ObjectCards from '../site/ObjectCards';
import QuizLink from '../site/QuizLink';
export default function ServiceObjects({ section }: { section: ServiceSection }) {
  return (
    <section className="section objects" id="objects">
      <div className="container">
        <Heading section={section} />
        <ObjectCards items={section.items || []} service="survey" actionLabel="Проверить объект" />
        <div className="section-cta">
          <div>
            <h3>{section.noteTitle}</h3>
            <p>{section.note}</p>
          </div>
          <QuizLink service="survey">{section.action}</QuizLink>
        </div>
      </div>
    </section>
  );
}
