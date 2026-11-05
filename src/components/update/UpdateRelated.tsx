import type { ServiceSection } from '@/lib/service-page-types';
import type { Service } from '@/lib/content-types';
import { price } from '@/lib/content-types';
import { Arrow, Heading } from '../site/primitives';

export default function UpdateRelated({
  section,
  services,
}: {
  section: ServiceSection;
  services: Service[];
}) {
  return (
    <section className="section update-related" id="related-services">
      <div className="container">
        <Heading section={section} />
        <div className="update-related__grid">
          {section.items?.map((item) => (
            <article key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <strong>
                {price(
                  services.find((service) => service.id === item.service)!,
                )}
              </strong>
              <a className="text-link" href={item.url}>
                {item.action}
                <Arrow />
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
