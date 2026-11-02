import { useEffect, useState } from 'react';
import type { Section, SiteContent } from '@/lib/content-types';
import { price } from '@/lib/content-types';
import { Arrow, CheckList } from '../site/primitives';
import ContactFields, { Consent, formContacts } from './ContactFields';
import { useLeadSubmission } from './useLeadSubmission';
import { track } from '@/lib/analytics';
export default function ContactSection({
  content,
  initialService = '',
  section: sectionOverride,
  showServicePrice = false,
  commentLabel = 'Объект или задача',
}: {
  content: SiteContent;
  initialService?: string;
  section?: Section;
  showServicePrice?: boolean;
  commentLabel?: string;
}) {
  const section = sectionOverride || content.sections['17'];
  const [service, setService] = useState(initialService);
  const submission = useLeadSubmission();
  const selectedService = content.services.find((s) => s.id === service);
  const objects = content.quiz.questions.find((q) => q.id === 'objectType')?.options || [];
  useEffect(() => {
    const choose = (e: Event) => setService((e as CustomEvent<string>).detail);
    window.addEventListener('select-service', choose);
    return () => window.removeEventListener('select-service', choose);
  }, []);
  return (
    <section className="section contact" id="contact">
      <div className="container contact-grid">
        <div className="contact-copy">
          <p className="eyebrow">{section.eyebrow}</p>
          <h2>{section.title}</h2>
          <p>{section.description}</p>
          <CheckList items={section.benefits || []} />
          <a className="contact-phone" href={`tel:${content.site.phone.replace(/[^+\d]/g, '')}`}>
            {content.site.phone}
            <Arrow />
          </a>
          {content.site.email && <a href={`mailto:${content.site.email}`}>{content.site.email}</a>}
        </div>
        <div className="contact-panel">
          {submission.success ? (
            <div className="contact-success" role="status">
              <span className="success-mark" aria-hidden="true">
                ✓
              </span>
              <h3>Спасибо! Мы получили сведения о вашем объекте.</h3>
              <p>
                Специалист проверит информацию, уточнит состав необходимой документации и свяжется с
                вами по вопросу разработки.
              </p>
            </div>
          ) : (
            <form
              method="post"
              action="/api/leads"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const contacts = formContacts(form);
                const fd = new FormData(form);
                if (
                  await submission.submit({
                    ...contacts,
                    source: 'contact',
                    service,
                    objectType: String(fd.get('objectType') || ''),
                    comment: String(fd.get('comment') || ''),
                  })
                )
                  track('lead_submit', location.pathname, content.site.metrikaId);
              }}
            >
              <ContactFields prefix="contact" />
              {service && (
                <div className="selected-service">
                  <span>Выбранная услуга</span>
                  <p>
                    {selectedService?.title ||
                      (service === 'update' ? 'Актуализация паспорта доступности' : service)}
                    {showServicePrice && selectedService && <> — {price(selectedService)}</>}
                  </p>
                  <button
                    type="button"
                    onClick={() => setService('')}
                    aria-label="Убрать выбранную услугу"
                  >
                    ×
                  </button>
                </div>
              )}
              <label htmlFor="contact-object">
                Тип объекта
                <select name="objectType" id="contact-object" defaultValue="">
                  <option value="">Выберите тип объекта</option>
                  {objects.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="contact-comment">
                {commentLabel}
                <textarea name="comment" id="contact-comment" rows={3} maxLength={3000} />
              </label>
              <Consent prefix="contact" />
              {submission.error && (
                <p role="alert" className="form-error">
                  {submission.error}
                </p>
              )}
              <button
                className="button button-primary form-submit"
                type="submit"
                disabled={submission.pending}
              >
                {submission.pending ? 'Отправка…' : 'Отправить заявку'}
                <Arrow />
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
