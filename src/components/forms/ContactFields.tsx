export type ContactDraft = { name: string; phone: string; email: string; consent: boolean };
export default function ContactFields({
  prefix,
  defaults,
}: {
  prefix: string;
  defaults?: ContactDraft;
}) {
  return (
    <>
      <div className="field-row">
        <label htmlFor={`${prefix}-name`}>
          Ваше имя
          <input
            id={`${prefix}-name`}
            name="name"
            defaultValue={defaults?.name}
            autoComplete="name"
            required
            minLength={2}
            maxLength={100}
          />
        </label>
        <label htmlFor={`${prefix}-phone`}>
          Телефон
          <input
            id={`${prefix}-phone`}
            name="phone"
            defaultValue={defaults?.phone}
            type="tel"
            autoComplete="tel"
            required
            maxLength={25}
            placeholder="+7 (___) ___-__-__"
            onInput={(e) => {
              const t = e.currentTarget;
              const digits = t.value.replace(/\D/g, '');
              t.setCustomValidity(
                digits.length >= 10 && digits.length <= 15
                  ? ''
                  : 'Укажите телефон: от 10 до 15 цифр.',
              );
            }}
          />
        </label>
      </div>
      <label htmlFor={`${prefix}-email`}>
        Электронная почта <span className="field-optional">необязательно</span>
        <input
          id={`${prefix}-email`}
          name="email"
          defaultValue={defaults?.email}
          type="email"
          autoComplete="email"
          maxLength={200}
        />
      </label>
      <label className="honeypot" aria-hidden="true">
        Сайт
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </>
  );
}
export function Consent({
  prefix,
  defaultChecked = false,
}: {
  prefix: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="consent" htmlFor={`${prefix}-consent`}>
      <input
        id={`${prefix}-consent`}
        name="consent"
        type="checkbox"
        required
        defaultChecked={defaultChecked}
      />
      <span>
        Даю{' '}
        <a href="/personal-data/" target="_blank" rel="noopener">
          согласие на обработку персональных данных
        </a>{' '}
        и принимаю{' '}
        <a href="/privacy/" target="_blank" rel="noopener">
          политику конфиденциальности
        </a>
        .
      </span>
    </label>
  );
}
export function formContacts(form: HTMLFormElement) {
  const f = new FormData(form);
  return {
    name: String(f.get('name') || '').trim(),
    phone: String(f.get('phone') || '').trim(),
    email: String(f.get('email') || '').trim(),
    website: String(f.get('website') || ''),
    consent: f.get('consent') === 'on',
  };
}
