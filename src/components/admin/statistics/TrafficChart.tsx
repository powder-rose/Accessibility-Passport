import { useId } from 'react';
import type { DailyStatistics } from '@/features/statistics/model';

export function statisticsDate(day: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Moscow',
  }).format(new Date(day + 'T12:00:00Z'));
}

export default function TrafficChart({ daily }: { daily: DailyStatistics[] }) {
  const title = useId();
  const max = Math.max(
    1,
    ...daily.map((day) => day.pageviews),
    ...daily.map((day) => day.visits),
  );
  const points = (key: 'visits' | 'pageviews') =>
    daily
      .map(
        (day, index) =>
          `${12 + (index * 616) / Math.max(1, daily.length - 1)},${168 - (day[key] / max) * 144}`,
      )
      .join(' ');
  return (
    <figure className="cms-traffic-chart">
      <figcaption>
        <span className="cms-chart-visits">Визиты</span>
        <span className="cms-chart-views">Просмотры</span>
        <span className="cms-chart-range">Шкала: 0–{max}</span>
      </figcaption>
      <svg viewBox="0 0 640 184" role="img" aria-labelledby={title}>
        <title id={title}>
          Визиты и просмотры по дням. Максимум шкалы: {max}. Точные значения
          доступны в таблице ниже.
        </title>
        <path className="cms-chart-axis" d="M12 168H628M12 96H628M12 24H628" />
        <polyline
          className="cms-chart-views-line"
          points={points('pageviews')}
        />
        <polyline className="cms-chart-visits-line" points={points('visits')} />
      </svg>
      <div className="cms-chart-dates">
        <span>{statisticsDate(daily[0].date)}</span>
        <span>{statisticsDate(daily.at(-1)!.date)}</span>
      </div>
    </figure>
  );
}
