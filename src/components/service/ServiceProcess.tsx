import type { ServiceSection } from '@/lib/service-page-types';
import { Heading, Note } from '../site/primitives';

export default function ServiceProcess({ section }: { section: ServiceSection }) {
  return (
    <section className="section service-process" id="process">
      <div className="container">
        <Heading section={section} />
        <ol className="service-journey">
          {section.items?.map((item, index) => (
            <li className="service-journey__step reveal" key={item.title}>
              <span className="service-journey__index" aria-hidden="true">
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
