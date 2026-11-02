import type { ReactNode } from 'react';
import { Arrow } from './primitives';
export default function QuizLink({
  service,
  objectType,
  className = 'text-link',
  children,
}: {
  service?: string;
  objectType?: string;
  className?: string;
  children: ReactNode;
}) {
  const params = new URLSearchParams();
  if (service) params.set('service', service);
  if (objectType) params.set('object_type', objectType);
  const href = (params.size ? '?' + params.toString() : '') + '#quiz';
  return (
    <a
      href={href}
      className={className}
      data-quiz=""
      data-quiz-service={service}
      data-object={objectType}
    >
      {children}
      <Arrow />
    </a>
  );
}
