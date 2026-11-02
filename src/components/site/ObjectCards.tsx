import type { Item } from '@/lib/content-types';
import { publishedHref } from '@/lib/routes';
import { Arrow } from './primitives';
export default function ObjectCards({
  items,
  service,
  actionLabel = 'Подробнее',
}: {
  items: Item[];
  service?: string;
  actionLabel?: string;
}) {
  return (
    <div className="objects-grid">
      {items.map((x, i) => (
        <article key={x.title} className="object-card reveal">
          <div className="object-image">
            <img src={x.image} alt={x.title} loading="lazy" width="360" height="240" />
            <span className="object-number">0{i + 1}</span>
          </div>
          <div className="object-copy">
            <h3>{x.title}</h3>
            <p>{x.text}</p>
            <a
              className="text-link"
              data-quiz={service ? '' : undefined}
              data-quiz-service={service}
              href={
                publishedHref(x.url) ||
                '?object_type=' +
                  encodeURIComponent(x.objectType || '') +
                  (service ? '&service=' + encodeURIComponent(service) : '') +
                  '#quiz'
              }
              data-object={x.objectType}
            >
              {actionLabel}
              <Arrow />
            </a>
          </div>
        </article>
      ))}
    </div>
  );
}
