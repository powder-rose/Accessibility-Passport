import { statisticsPeriods } from '@/features/statistics/model';
import { useStatistics } from './useStatistics';
import TrafficChart, { statisticsDate } from './TrafficChart';

const number = (value: number) => value.toLocaleString('ru-RU');
const sourceName = (source: string) =>
  source === 'direct'
    ? 'Прямые переходы'
    : source.startsWith('campaign:')
      ? 'UTM: ' + source.slice(9)
      : source;
const formName = (source: string) =>
  source === 'contact'
    ? 'Форма обращения'
    : source === 'express'
      ? 'Экспресс-проверка ОСИ'
      : 'Другие формы';

export default function StatisticsPanel({
  onSessionExpired,
}: {
  onSessionExpired: () => void;
}) {
  const stats = useStatistics(onSessionExpired);
  const data = stats.data;
  return (
    <section
      className="cms-statistics"
      aria-labelledby="statistics-heading"
      aria-busy={stats.loading}
    >
      <div className="cms-statistics-toolbar">
        <h2 id="statistics-heading">Сводка</h2>
        <label>
          Период
          <select
            value={stats.days}
            onChange={(event) => {
              const days = statisticsPeriods.find(
                (value) => String(value) === event.target.value,
              );
              if (days) stats.setDays(days);
            }}
          >
            {statisticsPeriods.map((days) => (
              <option key={days} value={days}>
                {days} дней
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="cms-leads-button"
          disabled={stats.loading}
          onClick={stats.refresh}
        >
          Обновить статистику
        </button>
      </div>
      {stats.loading && <p role="status">Загрузка статистики…</p>}
      {stats.error && (
        <p className="form-error" role="alert">
          {stats.error} Нажмите «Обновить статистику», чтобы повторить.
        </p>
      )}
      {data && (
        <>
          <p className="cms-statistics-note">
            {statisticsDate(data.period.from)} —{' '}
            {statisticsDate(data.period.to)}. Время московское.
          </p>
          <dl className="cms-statistics-cards">
            <div>
              <dt>Заявки за {data.period.days} дней</dt>
              <dd>{number(data.leads.period)}</dd>
              <p>Сегодня: {number(data.leads.today)}</p>
            </div>
            <div>
              <dt>Визиты за {data.period.days} дней</dt>
              <dd>{number(data.traffic.visits)}</dd>
              <p>Новый сеанс после 30 минут бездействия</p>
            </div>
            <div>
              <dt>Просмотры страниц</dt>
              <dd>{number(data.traffic.pageviews)}</dd>
              <p>За выбранный период</p>
            </div>
            <div>
              <dt>Все заявки</dt>
              <dd>{number(data.leads.total)}</dd>
              <p>За всё время работы сайта</p>
            </div>
          </dl>
          <div
            className="cms-lead-totals"
            aria-label="Заявки по формам за выбранный период"
          >
            {data.leads.sources.map((item) => (
              <p key={item.source}>
                {formName(item.source)}: <strong>{number(item.count)}</strong>
              </p>
            ))}
          </div>
          <h2>Посещаемость</h2>
          <p className="cms-statistics-note">
            Учёт начат после обновления сайта. Просмотры админки и известные
            боты исключены.
          </p>
          {data.traffic.pageviews === 0 ? (
            <p className="cms-statistics-empty">
              За этот период посещений пока нет. Первые данные появятся после
              открытия публичных страниц посетителями.
            </p>
          ) : (
            <TrafficChart daily={data.traffic.daily} />
          )}
          <details className="cms-statistics-daily">
            <summary>Данные по дням</summary>
            <div className="cms-statistics-scroll">
              <table>
                <caption>Посещаемость и заявки по дням</caption>
                <thead>
                  <tr>
                    <th scope="col">Дата</th>
                    <th scope="col">Визиты</th>
                    <th scope="col">Просмотры</th>
                    <th scope="col">Заявки</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.traffic.daily].reverse().map((day) => (
                    <tr key={day.date}>
                      <th scope="row">{statisticsDate(day.date)}</th>
                      <td>{number(day.visits)}</td>
                      <td>{number(day.pageviews)}</td>
                      <td>{number(day.leads)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <div className="cms-statistics-breakdown">
            <section>
              <h3>Популярные страницы</h3>
              {data.traffic.pages.length ? (
                <div className="cms-statistics-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Страница</th>
                        <th scope="col">Просмотры</th>
                        <th scope="col">Визиты</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.traffic.pages.map((page) => (
                        <tr key={page.path}>
                          <th scope="row">
                            <a
                              href={page.path}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {page.path}
                            </a>
                          </th>
                          <td>{number(page.pageviews)}</td>
                          <td>{number(page.visits)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>Данных пока нет.</p>
              )}
            </section>
            <section>
              <h3>Источники переходов</h3>
              {data.traffic.sources.length ? (
                <div className="cms-statistics-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Источник</th>
                        <th scope="col">Визиты</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.traffic.sources.map((source) => (
                        <tr key={source.source}>
                          <th scope="row">{sourceName(source.source)}</th>
                          <td>{number(source.visits)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>Данных пока нет.</p>
              )}
            </section>
          </div>
        </>
      )}
    </section>
  );
}
