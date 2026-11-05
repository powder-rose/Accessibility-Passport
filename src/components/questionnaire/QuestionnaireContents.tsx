import type { SectionViewProps } from '../service/presentation-types';
import { Heading, Note } from '../site/primitives';
import ServiceGlyph from '../service/ServiceGlyph';

export default function QuestionnaireContents({
  section,
  id,
}: SectionViewProps & { id: string }) {
  return (
    <section className="section questionnaire-contents" id={id}>
      <div className="container">
        <Heading section={section} />
        <ol className="questionnaire-deliverables">
          {section.items?.map((item, index) => (
            <li className="reveal" key={item.title} data-result={index === 6}>
              <span aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
              {index === 6 && <ServiceGlyph name="document" />}
            </li>
          ))}
        </ol>
        <Note>{section.note}</Note>
      </div>
    </section>
  );
}
