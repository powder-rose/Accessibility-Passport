import {
  storageLevel,
  storageSize,
  storageWarningPercent,
  type StorageUsage as Usage,
} from '@/lib/storage';

export default function StorageUsage({
  title,
  usage,
}: {
  title: string;
  usage: Usage;
}) {
  const level = storageLevel(usage);
  return (
    <div className="cms-storage-usage" data-level={level}>
      <strong>{title}</strong>
      <p>
        {storageSize(usage.bytes)} из {storageSize(usage.limit)}
      </p>
      <progress
        value={Math.min(usage.bytes, usage.limit)}
        max={usage.limit}
        aria-label={`${title}: занято ${storageSize(usage.bytes)}`}
      />
      <p>
        Файлов: {usage.count}. Осталось:{' '}
        {storageSize(Math.max(0, usage.limit - usage.bytes))}.
      </p>
      {level !== 'ok' && (
        <p className="cms-storage-warning">
          {level === 'full'
            ? 'Лимит достигнут. Новые файлы не поместятся.'
            : `Занято не менее ${storageWarningPercent}%. Подготовьте свободное место.`}
        </p>
      )}
    </div>
  );
}
