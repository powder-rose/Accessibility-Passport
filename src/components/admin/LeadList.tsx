import type { LeadRecord } from './types';

export default function LeadList({ leads }: { leads: LeadRecord[] }) {
  return (
    <>
      {!leads.length && <p>Заявок пока нет.</p>}
      {leads.map((lead) => (
        <details className="cms-lead" key={lead.id}>
          <summary>
            {lead.createdAt} · {String(lead.payload.name)} · {String(lead.payload.sourceLabel)}
          </summary>
          <pre>{JSON.stringify(lead.payload, null, 2)}</pre>
        </details>
      ))}
    </>
  );
}
