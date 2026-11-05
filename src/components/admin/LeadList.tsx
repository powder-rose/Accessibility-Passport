import type { LeadRecord } from './types';
import type { AttachmentMetadata } from '@/lib/attachments';

function attachments(
  payload: Record<string, unknown>,
): Pick<AttachmentMetadata, 'id' | 'name' | 'size'>[] {
  return Array.isArray(payload.attachments)
    ? payload.attachments.filter(
        (file): file is Pick<AttachmentMetadata, 'id' | 'name' | 'size'> =>
          !!file &&
          typeof file === 'object' &&
          typeof file.id === 'string' &&
          /^[a-f0-9-]{36}$/.test(file.id) &&
          typeof file.name === 'string' &&
          typeof file.size === 'number',
      )
    : [];
}

export default function LeadList({ leads }: { leads: LeadRecord[] }) {
  return (
    <>
      {!leads.length && <p>Заявок пока нет.</p>}
      {leads.map((lead) => (
        <details className="cms-lead" key={lead.id}>
          <summary>
            {lead.createdAt} · {String(lead.payload.name)} ·{' '}
            {String(lead.payload.sourceLabel)}
          </summary>
          {!!attachments(lead.payload).length && (
            <ul className="cms-attachments">
              {attachments(lead.payload).map((file) => (
                <li key={file.id}>
                  <a href={`/api/admin/attachments/${file.id}`} download>
                    {file.name}
                  </a>{' '}
                  · {Math.ceil(file.size / 1024)} КБ
                </li>
              ))}
            </ul>
          )}
          <pre>{JSON.stringify(lead.payload, null, 2)}</pre>
        </details>
      ))}
    </>
  );
}
