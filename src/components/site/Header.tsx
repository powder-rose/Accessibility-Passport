import { useEffect, useRef, useState } from 'react';
import type { SiteContent } from '@/lib/content-types';
import { Arrow } from './primitives';
import HeaderDirectory from './HeaderDirectory';
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
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const menu = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const directoryToggle = useRef<HTMLButtonElement>(null);
  function closeMenus() {
    setOpen(false);
    setDirectoryOpen(false);
  }
  useEffect(() => {
    if (!open && !directoryOpen) return;
    function close(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setDirectoryOpen(false);
        (open ? toggle : directoryToggle).current?.focus();
      }
    }
    function outside(e: Event) {
      if (!menu.current?.contains(e.target as Node)) {
        setOpen(false);
        setDirectoryOpen(false);
      }
    }
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [open, directoryOpen]);
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
            <a key={href} href={href} onClick={closeMenus}>
              {label}
            </a>
          ))}
          <HeaderDirectory
            open={directoryOpen}
            toggleRef={directoryToggle}
            onToggle={() => setDirectoryOpen(!directoryOpen)}
            onNavigate={closeMenus}
          />
          <a className="mobile-contact" href={contactHref} onClick={closeMenus}>
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
          type="button"
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="main-navigation"
          aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
          onClick={() => {
            setOpen(!open);
            setDirectoryOpen(false);
          }}
        >
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}
