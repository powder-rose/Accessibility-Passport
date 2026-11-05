import type { ServiceSection } from '@/lib/service-page-types';
import { Heading, Note } from '../site/primitives';

export default function UpdateProcess({
  section,
}: {
  section: ServiceSection;
}) {
  return (
    <section className="section update-process" id="process">
      <div className="container">
        <Heading section={section} />
        <ol>
          {section.items?.map((item, index) => (
            <li className="reveal" key={item.title}>
              <span className="update-process__number">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </li>
          ))}
        </ol>
        <p className="update-process__support">{section.noteText}</p>
        <Note>{section.note}</Note>
      </div>
    </section>
  );
}
