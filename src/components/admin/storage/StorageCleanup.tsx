import { storageSize, type CleanupPreview } from '@/lib/storage';

export default function StorageCleanup({
  preview,
  selected,
  protectedIds,
  confirmed,
  pending,
  onSelect,
  onConfirm,
  onRemove,
}: {
  preview: CleanupPreview;
  selected: Set<string>;
  protectedIds: Set<string>;
  confirmed: boolean;
  pending: boolean;
  onSelect: (id: string) => void;
  onConfirm: (value: boolean) => void;
  onRemove: () => void;
}) {
  const selectedBytes = preview.images
    .filter((image) => selected.has(image.id))
    .reduce((sum, image) => sum + image.size, 0);
  return (
    <div className="cms-storage-cleanup">
      <p>
        Без связей с сохранёнными статьями: {preview.total} (
        {storageSize(preview.bytes)}). Показано: {preview.images.length}.
        Удаляются только выбранные файлы.
      </p>
      {preview.images.length === 0 && <p>Подходящих изображений нет.</p>}
      <ul className="cms-storage-images">
        {preview.images.map((image, index) => (
          <li key={image.id}>
            <label>
              <input
                type="checkbox"
                checked={selected.has(image.id)}
                disabled={pending || protectedIds.has(image.id)}
                onChange={() => onSelect(image.id)}
              />
              <span>Изображение {index + 1}</span>
              <img
                src={`/media/articles/${image.id}.webp`}
                alt=""
                width="160"
                height="100"
                loading="lazy"
              />
              <span>
                {storageSize(image.size)} · {image.width} × {image.height}
              </span>
              <span>
                Загружено{' '}
                {new Date(image.createdAt).toLocaleDateString('ru-RU')}
              </span>
              {protectedIds.has(image.id) && (
                <strong>
                  Используется в локальном черновике. Сохраните статью.
                </strong>
              )}
            </label>
          </li>
        ))}
      </ul>
      {preview.images.length > 0 && (
        <>
          <p>
            Выбрано: {selected.size} ({storageSize(selectedBytes)}).
          </p>
          <label className="cms-storage-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={pending}
              onChange={(event) => onConfirm(event.target.checked)}
            />{' '}
            Я сохранил черновики во всех вкладках и браузерах, сделал резервную
            копию и подтверждаю удаление выбранных изображений.
          </label>
          <button
            className="cms-leads-button"
            type="button"
            disabled={pending || !confirmed || selected.size === 0}
            onClick={onRemove}
          >
            Удалить выбранные изображения
          </button>
        </>
      )}
      {preview.total > preview.images.length && (
        <p>
          После очистки обновите предпросмотр для следующей группы. За одну
          операцию удаляется не более 100 изображений.
        </p>
      )}
    </div>
  );
}
