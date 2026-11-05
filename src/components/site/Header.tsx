import { useEffect, useRef, useState } from 'react';
import type { SiteContent } from '@/lib/content-types';
import { Arrow } from './primitives';
const links = [
  ['/#documents', 'Документы'],
  ['/#objects', 'Для кого'],
  ['/#process', 'Как работаем'],
  ['/#pricing', 'Стоимость'],
  ['/blog/', 'Блог'],
];
export default function Header({
  site,
  contactHref = '/#contact',
}: {
  site: SiteContent['site'];
  contactHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function close(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        toggle.current?.focus();
      }
    }
    function outside(e: PointerEvent) {
      if (!menu.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', outside);
    };
  }, [open]);
  return (
    <header className="site-header" ref={menu}>
      <div className="container header-inner">
        <a className="brand" href="/" aria-label="БОЙКОВГРУПП — главная">
          {site.brand}
          <span>{site.direction}</span>
        </a>
        <nav
          id="main-navigation"
          aria-label="Главная навигация"
          className={open ? 'navigation is-open' : 'navigation'}
        >
          {links.map(([href, label]) => (
            <a key={href} href={href} onClick={() => setOpen(false)}>
              {label}
            </a>
          ))}
          <a
            className="mobile-contact"
            href={contactHref}
            onClick={() => setOpen(false)}
          >
            Обсудить объект
          </a>
        </nav>
        <div className="header-actions">
          <a
            className="phone"
            href={`tel:${site.phone.replace(/[^+\d]/g, '')}`}
          >
            {site.phone}
          </a>
          <a className="header-cta" href={contactHref}>
            Обсудить объект
            <Arrow />
          </a>
        </div>
        <button
          ref={toggle}
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="main-navigation"
          aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
          onClick={() => setOpen(!open)}
        >
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}
