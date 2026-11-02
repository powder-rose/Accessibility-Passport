import { useState } from 'react';

export default function AdminLogin({
  onLogin,
  error,
}: {
  onLogin: (password: string) => Promise<void>;
  error: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <main className="cms-login">
      <a className="brand" href="/">
        БОЙКОВГРУПП
      </a>
      <h1>Заявки</h1>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const password = String(new FormData(event.currentTarget).get('password') || '');
          setBusy(true);
          try {
            await onLogin(password);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Пароль
          <input type="password" name="password" autoComplete="current-password" required />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="button button-primary" disabled={busy}>
          Войти
        </button>
      </form>
    </main>
  );
}
