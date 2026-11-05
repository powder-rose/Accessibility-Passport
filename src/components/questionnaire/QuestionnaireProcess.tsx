import type { SectionViewProps } from '../service/presentation-types';
import { Heading, Note } from '../site/primitives';

export default function QuestionnaireProcess({ section }: SectionViewProps) {
  return (
    <section className="section questionnaire-process" id="process">
      <div className="container">
        <Heading section={section} />
        <ol className="questionnaire-journey">
          {section.items?.map((item, index) => (
            <li key={item.title} className="reveal">
              <span className="questionnaire-journey__index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </li>
          ))}
        </ol>
        <Note>{section.note}</Note>
      </div>
    </section>
  );
}
