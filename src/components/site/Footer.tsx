import type { SiteContent } from '@/lib/content-types';
export default function Footer({ site }: { site: SiteContent['site'] }) {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top">
          <a className="brand" href="/#top">
            {site.brand}
            <span>{site.direction}</span>
          </a>
          <div className="footer-contact">
            <a href={`tel:${site.phone.replace(/[^+\d]/g, '')}`}>{site.phone}</a>
            {site.email && <a href={`mailto:${site.email}`}>{site.email}</a>}
          </div>
          <nav aria-label="Разделы в подвале">
            <a href="/#documents">Документы</a>
            <a href="/#objects">Типы объектов</a>
            <a href="/#pricing">Стоимость</a>
            <a href="/#faq">Вопрос — ответ</a>
          </nav>
        </div>
        <div className="footer-bottom">
          <p>
            © {new Date().getFullYear()} {site.company}
            <span>
              ИНН {site.inn} · ОГРН {site.ogrn}
            </span>
          </p>
          <div>
            <a href="/#requisites">Реквизиты компании</a>
            <a href="/privacy/">Политика конфиденциальности</a>
            <a href="/personal-data/">Согласие на обработку персональных данных</a>
          </div>
          <a className="back-top" href="/#top" aria-label="В начало страницы">
            ↑
          </a>
        </div>
      </div>
    </footer>
  );
}
