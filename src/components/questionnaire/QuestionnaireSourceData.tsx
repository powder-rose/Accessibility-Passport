import type { SectionViewProps } from '../service/presentation-types';
import { OrderLink } from '../site/primitives';
import ServiceGlyph from '../service/ServiceGlyph';

export default function QuestionnaireSourceData({
  section,
  service,
}: SectionViewProps) {
  return (
    <section className="section questionnaire-source" id="source-data">
      <div className="container questionnaire-source__grid">
        <div className="questionnaire-source__heading">
          <p className="eyebrow">{section.eyebrow}</p>
          <h2>{section.title}</h2>
          <div className="questionnaire-source__advice">
            <h3>{section.noteTitle}</h3>
            <p>{section.note}</p>
            <OrderLink service={service}>{section.action}</OrderLink>
          </div>
        </div>
        <div className="questionnaire-source__groups">
          {section.groups?.map((group, index) => (
            <article
              className="questionnaire-source__group reveal"
              key={group.title}
            >
              <div className="questionnaire-source__title">
                <ServiceGlyph
                  name={(['building', 'people', 'route'] as const)[index]}
                />
                <h3>{group.title}</h3>
              </div>
              <ul>
                {group.indices.map((itemIndex) => (
                  <li key={itemIndex}>{section.benefits?.[itemIndex]}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
