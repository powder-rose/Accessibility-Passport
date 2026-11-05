import type { Item } from '@/lib/content-types';
export default function NumberedGrid({ items }: { items: Item[] }) {
  return (
    <ol className="service-numbered">
      {items.map((item, index) => (
        <li className="reveal" key={item.title}>
          <span className="service-numbered__index" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
          <div>
            <p className="service-numbered__title">{item.title}</p>
            {item.text && <p className="service-numbered__text">{item.text}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
