import type { SectionViewProps } from '../service/presentation-types';
import { Note, OrderLink } from '../site/primitives';
import DataFlowGraphic from './DataFlowGraphic';

export default function QuestionnaireOverview({
  section,
  service,
}: SectionViewProps) {
  return (
    <section className="section questionnaire-overview" id="about">
      <div className="container questionnaire-overview__grid">
        <div className="questionnaire-overview__heading">
          <p className="eyebrow">{section.eyebrow}</p>
          <h2>{section.title}</h2>
          <DataFlowGraphic />
        </div>
        <div className="questionnaire-overview__copy">
          <p className="questionnaire-overview__lead reveal">
            {section.paragraphs?.[0]}
          </p>
          {section.paragraphs?.slice(1).map((text, index) => (
            <p
              className={
                index === 1
                  ? 'questionnaire-overview__method reveal'
                  : 'questionnaire-overview__detail reveal'
              }
              key={text}
            >
              {text}
            </p>
          ))}
          <Note>{section.note}</Note>
          <OrderLink service={service}>{section.action}</OrderLink>
        </div>
      </div>
    </section>
  );
}
