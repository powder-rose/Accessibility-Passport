import type { ServiceSection } from '@/lib/service-page-types';
import { Arrow, Heading, Note } from '../site/primitives';
import UpdateAction from './UpdateAction';

export default function UpdateDocuments({
  section,
}: {
  section: ServiceSection;
}) {
  return (
    <section className="section update-documents" id="documents">
      <div className="container">
        <Heading section={section} />
        <div className="update-documents__grid">
          {section.items?.map((item, index) => (
            <a
              className="update-document reveal"
              href={item.url}
              key={item.title}
            >
              <span className="update-index">0{index + 1}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <Arrow />
            </a>
          ))}
        </div>
        <div className="update-documents__note">
          <Note>
            {section.note} {section.noteText}
          </Note>
          <div>
            <h3>{section.noteTitle}</h3>
            <UpdateAction>{section.action}</UpdateAction>
          </div>
        </div>
      </div>
    </section>
  );
}
