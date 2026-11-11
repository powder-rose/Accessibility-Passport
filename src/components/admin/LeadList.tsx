import type { LeadRecord } from './types';
import { leadDate, presentLead } from './lead-presentation';

export default function LeadList({ leads }: { leads: LeadRecord[] }) {
  return (
    <>
      {!leads.length && <p>Заявок пока нет.</p>}
      {leads.map((lead) => {
        const item = presentLead(lead);
        return (
          <details className="cms-lead" key={lead.id}>
            <summary>
              <time dateTime={lead.createdAt}>{leadDate(lead.createdAt)}</time>
              <strong>{item.name}</strong>
              <span>{item.phone || 'Телефон не указан'}</span>
              <span className="cms-lead-source">{item.source}</span>
            </summary>
            <dl className="cms-lead-fields">
              {item.phone && (
                <div>
                  <dt>Телефон</dt>
                  <dd>
                    <a href={'tel:' + item.phone.replace(/[^+\d]/g, '')}>
                      {item.phone}
                    </a>
                  </dd>
                </div>
              )}
              {item.email && (
                <div>
                  <dt>Почта</dt>
                  <dd>
                    <a href={'mailto:' + encodeURIComponent(item.email)}>
                      {item.email}
                    </a>
                  </dd>
                </div>
              )}
              {item.service && (
                <div>
                  <dt>Услуга</dt>
                  <dd>{item.service}</dd>
                </div>
              )}
              {item.object && (
                <div>
                  <dt>Объект</dt>
                  <dd>{item.object}</dd>
                </div>
              )}
              {item.passportDate && (
                <div>
                  <dt>Когда разработан паспорт</dt>
                  <dd>{item.passportDate}</dd>
                </div>
              )}
              {item.page && (
                <div>
                  <dt>Страница обращения</dt>
                  <dd>
                    <a
                      href={item.page}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {item.page}
                    </a>
                  </dd>
                </div>
              )}
              {item.result && (
                <div>
                  <dt>Результат проверки</dt>
                  <dd>{item.result}</dd>
                </div>
              )}
            </dl>
            {item.comment && (
              <div className="cms-lead-comment">
                <h3>Комментарий</h3>
                <p>{item.comment}</p>
              </div>
            )}
            {!!item.questions.length && (
              <dl className="cms-lead-answers">
                {item.questions.map((question, index) => (
                  <div key={index}>
                    <dt>{question.question}</dt>
                    <dd>{question.answers.join('; ')}</dd>
                  </div>
                ))}
              </dl>
            )}
            {!!item.campaignFields.length && (
              <details className="cms-lead-attribution">
                <summary>Источник обращения</summary>
                <dl className="cms-lead-fields">
                  {item.campaignFields.map((field) => (
                    <div key={field.label}>
                      <dt>{field.label}</dt>
                      <dd>{field.value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
            {!!item.files.length && (
              <ul className="cms-attachments">
                {item.files.map((file) => (
                  <li key={file.id}>
                    <a href={`/api/admin/attachments/${file.id}`} download>
                      {file.name}
                    </a>{' '}
                    · {Math.ceil(file.size / 1024)} КБ
                  </li>
                ))}
              </ul>
            )}
          </details>
        );
      })}
    </>
  );
}
