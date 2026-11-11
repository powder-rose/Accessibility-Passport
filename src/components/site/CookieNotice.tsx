import { useEffect, useState } from 'react';

const storageKey = 'osi-cookie-notice-v1';

export default function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(storageKey) !== 'dismissed');
    } catch {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(storageKey, 'dismissed');
    } catch {
      // A blocked browser store must not prevent closing the notice.
    }
  }

  if (!visible) return null;

  return (
    <aside className="cookie-notice" aria-labelledby="cookie-notice-title">
      <div className="cookie-notice__top">
        <p className="cookie-notice__eyebrow">Приватность</p>
        <button
          className="cookie-notice__close"
          type="button"
          aria-label="Закрыть уведомление о cookie"
          onClick={dismiss}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <h2 id="cookie-notice-title">Мы используем cookie</h2>
      <p className="cookie-notice__description">
        Файлы cookie и аналитика посещений помогают поддерживать работу сайта и
        улучшать его. На сайте используется Яндекс Метрика с Вебвизором.
      </p>
      <div className="cookie-notice__actions">
        <a href="/privacy/">Политика конфиденциальности ↗</a>
        <button type="button" onClick={dismiss}>
          Понятно ↗
        </button>
      </div>
    </aside>
  );
}
