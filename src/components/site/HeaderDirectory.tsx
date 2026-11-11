import type { RefObject } from 'react';
import { routes } from '@/lib/routes';

const links = [
  [routes.survey, 'Акт обследования ОСИ'],
  [routes.questionnaire, 'Анкета ОСИ'],
  [routes.update, 'Актуализация паспорта доступности'],
];

export default function HeaderDirectory({
  open,
  toggleRef,
  onToggle,
  onNavigate,
}: {
  open: boolean;
  toggleRef: RefObject<HTMLButtonElement | null>;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  return (
    <div className="header-directory-anchor">
      <button
        ref={toggleRef}
        className="header-directory-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="header-directory"
        onClick={onToggle}
      >
        Все разделы
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="m3 4.5 3 3 3-3" />
        </svg>
      </button>
      <div className="header-directory" id="header-directory" hidden={!open}>
        {links.map(([href, label]) => (
          <a href={href} key={href} onClick={onNavigate}>
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}
