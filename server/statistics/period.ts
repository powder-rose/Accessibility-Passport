import type { StatisticsDays } from '../../src/features/statistics/model';

const dayMilliseconds = 24 * 60 * 60 * 1000;
const moscowOffset = 3 * 60 * 60 * 1000;
export const moscowSqlOffset = '+3 hours';

export function statisticsPeriod(days: StatisticsDays, now: number) {
  const today = new Date(now + moscowOffset).toISOString().slice(0, 10);
  const todayStart = Date.parse(today + 'T00:00:00+03:00');
  const start = todayStart - (days - 1) * dayMilliseconds;
  const end = todayStart + dayMilliseconds;
  return {
    start,
    end,
    todayStart,
    dates: Array.from({ length: days }, (_, index) =>
      new Date(start + index * dayMilliseconds + moscowOffset)
        .toISOString()
        .slice(0, 10),
    ),
  };
}
