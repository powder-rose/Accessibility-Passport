import { useEffect, useRef, useState } from 'react';
import { safeArticleLink } from '@/features/articles/links';
export default function EditorLinkDialog({
  value,
  onSave,
  onClose,
}: {
  value: string;
  onSave: (href: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [href, setHref] = useState(value);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="editor-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const value = href.trim();
          if (value && !safeArticleLink(value)) {
            setError(
              'Укажите адрес https://, внутренний путь /, mailto: или tel:.',
            );
            return;
          }
          onSave(value);
        }}
      >
        <h2>{value ? 'Изменить ссылку' : 'Добавить ссылку'}</h2>
        <label>
          Адрес ссылки
          <input
            autoFocus
            type="text"
            value={href}
            maxLength={2000}
            onChange={(event) => setHref(event.target.value)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="editor-dialog__actions">
          <button type="button" onClick={onClose}>
            Отмена
          </button>
          <button type="submit">Применить</button>
        </div>
      </form>
    </dialog>
  );
}
