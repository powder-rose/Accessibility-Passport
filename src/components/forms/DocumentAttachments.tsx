import { useState } from 'react';
import {
  attachmentKinds,
  attachmentLabels,
  attachmentSelectionError,
  defaultAttachmentLimits,
  MiB,
  type SelectedAttachment,
} from '@/lib/attachments';
import { createRequestId } from '@/lib/request-id';
import { track } from '@/lib/analytics';

export default function DocumentAttachments({
  files,
  onChange,
  disabled,
  metrikaId,
}: {
  files: SelectedAttachment[];
  onChange: (files: SelectedAttachment[]) => void;
  disabled: boolean;
  metrikaId: string;
}) {
  const limits = defaultAttachmentLimits;
  const [error, setError] = useState('');
  return (
    <fieldset
      className="document-attachments ym-hide-content"
      id="document-attachments"
      disabled={disabled}
    >
      <legend>Документы для проверки</legend>
      <p id="attachment-help">
        PDF, DOCX, XLSX, JPG, PNG. До {limits.maxFiles} файлов, до{' '}
        {limits.maxFileBytes / MiB} МБ каждый и {limits.maxTotalBytes / MiB} МБ
        всего. Необязательно.
      </p>
      {attachmentKinds.map((kind) => (
        <div className="attachment-picker" key={kind}>
          <label className="attachment-label" htmlFor={`attachment-${kind}`}>
            <span aria-hidden="true">＋</span>
            {attachmentLabels[kind]}
          </label>
          <input
            id={`attachment-${kind}`}
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png"
            aria-describedby="attachment-help"
            onChange={(event) => {
              const next = [
                ...files,
                ...Array.from(event.currentTarget.files || []).map((file) => ({
                  file,
                  kind,
                  key: createRequestId(),
                })),
              ];
              const problem = attachmentSelectionError(next, limits);
              setError(problem);
              if (!problem) {
                onChange(next);
                track('document_file_selected', location.pathname, metrikaId);
              }
              event.currentTarget.value = '';
            }}
          />
          {!!files.filter((file) => file.kind === kind).length && (
            <ul className="attachment-list">
              {files
                .filter((file) => file.kind === kind)
                .map(({ file, key }) => (
                  <li key={key}>
                    <span>
                      {file.name}
                      <small>
                        {Math.max(1, Math.ceil(file.size / 1024))} КБ
                      </small>
                    </span>
                    <button
                      type="button"
                      aria-label={`Убрать файл ${file.name}`}
                      onClick={() => {
                        onChange(files.filter((item) => item.key !== key));
                        setError('');
                      }}
                    >
                      ×
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      ))}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
