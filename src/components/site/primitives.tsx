import type { ReactNode } from 'react';
import type { Section } from '@/lib/content-types';

export function Arrow({ diagonal = true }: { diagonal?: boolean }) {
  return (
    <svg className="arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={diagonal ? 'M5 19 19 5M5 5h14v14' : 'M4 12h16m-6-6 6 6-6 6'}
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}
export function Heading({
  section,
  children,
}: {
  section: Section;
  children?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{section.eyebrow}</p>
        <h2>{section.title}</h2>
      </div>
      {(section.description || children) && (
        <div className="section-heading__aside">
          {section.description && <p>{section.description}</p>}
          {children}
        </div>
      )}
    </div>
  );
}
export function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="check-list">
      {items.map((x) => (
        <li key={x}>
          <span aria-hidden="true">↗</span>
          {x}
        </li>
      ))}
    </ul>
  );
}
export function OrderLink({
  service,
  children,
  className = 'text-link',
}: {
  service?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      className={className}
      href={
        service ? `?service=${encodeURIComponent(service)}#contact` : '#contact'
      }
      data-order={service || ''}
    >
      {children}
      <Arrow />
    </a>
  );
}
export function Note({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <aside className="note">
      {title && <h3>{title}</h3>}
      <p>{children}</p>
    </aside>
  );
}
