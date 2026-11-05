import type { ServiceSection } from '@/lib/service-page-types';
import { Heading } from '../site/primitives';
import UpdateAction from './UpdateAction';

export default function UpdateSourceData({
  section,
}: {
  section: ServiceSection;
}) {
  return (
    <section className="section update-source" id="source-data">
      <div className="container">
        <Heading section={section} />
        <ul className="update-source__list">
          {section.benefits?.map((text, index) => (
            <li key={text}>
              <span className="update-index">
                {String(index + 1).padStart(2, '0')}
              </span>
              {text}
            </li>
          ))}
        </ul>
        <div className="update-source__missing">
          <div>
            <h3>{section.noteTitle}</h3>
            <p>{section.note}</p>
            <p>{section.noteText}</p>
          </div>
          <UpdateAction>{section.action}</UpdateAction>
        </div>
      </div>
    </section>
  );
}
