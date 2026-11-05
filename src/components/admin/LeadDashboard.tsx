import LeadList from './LeadList';
import type { LeadRecord } from './types';
import AttachmentSettings from './AttachmentSettings';

export default function LeadDashboard({
  leads,
  error,
}: {
  leads: LeadRecord[];
  error: string;
}) {
  return (
    <section>
      <h1 className="cms-section-title">Заявки</h1>
      <AttachmentSettings />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <LeadList leads={leads} />
    </section>
  );
}
