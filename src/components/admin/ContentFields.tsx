const labels: Record<string, string> = {
  eyebrow: 'Надзаголовок',
  title: 'Заголовок',
  description: 'Описание',
  text: 'Текст',
  label: 'Подпись',
  action: 'Текст кнопки',
  image: 'Изображение',
  url: 'Опубликованный адрес',
  price: 'Цена, ₽',
  from: 'Стоимость «от»',
  note: 'Пояснение',
  noteTitle: 'Заголовок пояснения',
  noteText: 'Текст пояснения',
  paragraphs: 'Абзацы',
  items: 'Карточки',
  benefits: 'Преимущества',
  points: 'Состав',
  flow: 'Этапы схемы',
  quote: 'Цитата',
  brand: 'Бренд',
  direction: 'Направление',
  company: 'Компания',
  inn: 'ИНН',
  ogrn: 'ОГРН',
  phone: 'Телефон',
  email: 'Email',
  domain: 'Основной домен',
  metrikaId: 'Номер счётчика Метрики',
  indexing: 'Разрешить индексацию',
  canonical: 'Canonical',
  questions: 'Вопросы',
  hint: 'Подсказка',
  required: 'Обязательный вопрос',
  multiple: 'Множественный выбор',
  options: 'Варианты ответа',
  enabled: 'Показывать проверку',
  successTitle: 'Заголовок результата',
  successText: 'Текст результата',
  objectType: 'Тип объекта',
  service: 'Идентификатор услуги',
  id: 'Идентификатор',
  heroImage: 'Фотография первого экрана',
  expertImage: 'Фотография эксперта',
};
export default function ContentFields({
  value,
  onChange,
  path = 'root',
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  path?: string;
}) {
  if (Array.isArray(value))
    return (
      <div className="cms-array">
        {value.map((v, i) => (
          <div className="cms-array-item" key={i}>
            <div className="cms-array-controls">
              <span>{i + 1}</span>
              <button
                type="button"
                disabled={i === 0}
                aria-label="Переместить выше"
                onClick={() => {
                  const n = [...value];
                  [n[i - 1], n[i]] = [n[i], n[i - 1]];
                  onChange(n);
                }}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={i === value.length - 1}
                aria-label="Переместить ниже"
                onClick={() => {
                  const n = [...value];
                  [n[i + 1], n[i]] = [n[i], n[i + 1]];
                  onChange(n);
                }}
              >
                ↓
              </button>
            </div>
            <ContentFields
              value={v}
              path={`${path}-${i}`}
              onChange={(next) => onChange(value.map((x, j) => (j === i ? next : x)))}
            />
          </div>
        ))}
      </div>
    );
  if (value !== null && typeof value === 'object')
    return (
      <div className="cms-fields">
        {Object.entries(value).map(([k, v]) => (
          <div className="cms-field" key={k}>
            <label htmlFor={`${path}-${k}`}>{labels[k] || k}</label>
            {typeof v === 'object' ? (
              <details>
                <summary>
                  {Array.isArray(v) ? `${labels[k] || k} (${v.length})` : labels[k] || k}
                </summary>
                <ContentFields
                  value={v}
                  path={`${path}-${k}`}
                  onChange={(next) => onChange({ ...value, [k]: next })}
                />
              </details>
            ) : typeof v === 'boolean' ? (
              <input
                id={`${path}-${k}`}
                type="checkbox"
                checked={v}
                onChange={(e) => onChange({ ...value, [k]: e.target.checked })}
              />
            ) : typeof v === 'number' ? (
              <input
                id={`${path}-${k}`}
                type="number"
                value={v}
                onChange={(e) => onChange({ ...value, [k]: Number(e.target.value) })}
              />
            ) : (
              <textarea
                id={`${path}-${k}`}
                value={String(v)}
                readOnly={['id', 'service', 'objectType'].includes(k)}
                rows={String(v).length > 160 ? 4 : 2}
                onChange={(e) => onChange({ ...value, [k]: e.target.value })}
              />
            )}
          </div>
        ))}
      </div>
    );
  return (
    <textarea
      aria-label="Текст"
      value={String(value)}
      rows={3}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
