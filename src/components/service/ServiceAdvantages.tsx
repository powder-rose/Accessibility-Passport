import type { Item } from '@/lib/content-types';
import NumberedGrid from './NumberedGrid';

export default function ServiceAdvantages({ items }: { items: Item[] }) {
  return (
    <section
      className="service-benefits"
      aria-label="Преимущества подготовки документа"
    >
      <div className="container">
        <NumberedGrid items={items} />
      </div>
    </section>
  );
}
