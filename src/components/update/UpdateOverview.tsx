import type { ServiceSection } from '@/lib/service-page-types';
import { Note } from '../site/primitives';
import UpdateAction from './UpdateAction';

export default function UpdateOverview({
  section,
}: {
  section: ServiceSection;
}) {
  return (
    <section className="section update-overview" id="overview">
      <div className="container update-overview__grid">
        <div>
          <p className="eyebrow">{section.eyebrow}</p>
          <h2>{section.title}</h2>
          <div className="update-document-graphic" aria-hidden="true">
            <div className="update-document-graphic__sheet">
              <span>ОСИ</span>
              <div />
              <div />
              <div />
              <i />
            </div>
            <svg viewBox="0 0 120 120" fill="none">
              <path
                d="M99 62a39 39 0 1 1-12-29M87 15v18H69"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>
        <div className="update-overview__copy">
          {section.paragraphs?.map((text) => (
            <p key={text}>{text}</p>
          ))}
          <Note>{section.note}</Note>
          <UpdateAction review quiz>
            {section.action}
          </UpdateAction>
        </div>
      </div>
    </section>
  );
}
