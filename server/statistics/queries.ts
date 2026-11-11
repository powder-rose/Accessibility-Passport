import type { DatabaseSync } from 'node:sqlite';
import {
  statisticsPeriods,
  type AdminStatistics,
  type StatisticsDays,
} from '../../src/features/statistics/model';
import { moscowSqlOffset, statisticsPeriod } from './period';

export class StatisticsQueries {
  constructor(private readonly db: DatabaseSync) {}

  report(days: StatisticsDays, now = Date.now()): AdminStatistics {
    if (!statisticsPeriods.includes(days))
      throw new RangeError('Invalid statistics period.');
    const { start, end, todayStart, dates } = statisticsPeriod(days, now);
    const fromIso = new Date(start).toISOString();
    const endIso = new Date(end).toISOString();
    const todayIso = new Date(todayStart).toISOString();
    const leads = this.db
      .prepare(
        'SELECT COUNT(*) AS total, COALESCE(SUM(created_at >= ? AND created_at < ?),0) AS today, COALESCE(SUM(created_at >= ? AND created_at < ?),0) AS period FROM leads',
      )
      .get(todayIso, endIso, fromIso, endIso) as {
      total: number;
      today: number;
      period: number;
    };
    const leadSources = this.db
      .prepare(
        'SELECT source,COUNT(*) AS count FROM leads WHERE created_at >= ? AND created_at < ? GROUP BY source ORDER BY count DESC,source',
      )
      .all(fromIso, endIso) as AdminStatistics['leads']['sources'];
    const visits = this.db
      .prepare(
        'SELECT COUNT(*) AS count FROM analytics_visits WHERE started_at >= ? AND started_at < ?',
      )
      .get(start, end) as { count: number };
    const views = this.db
      .prepare(
        'SELECT COUNT(*) AS count FROM analytics_pageviews WHERE created_at >= ? AND created_at < ?',
      )
      .get(start, end) as { count: number };
    const daily = dates.map((date) => ({
      date,
      visits: 0,
      pageviews: 0,
      leads: 0,
    }));
    const groups = [
      {
        key: 'visits' as const,
        sql: "SELECT date(started_at/1000,'unixepoch',?) AS date,COUNT(*) AS count FROM analytics_visits WHERE started_at >= ? AND started_at < ? GROUP BY date",
        parameters: [moscowSqlOffset, start, end],
      },
      {
        key: 'pageviews' as const,
        sql: "SELECT date(created_at/1000,'unixepoch',?) AS date,COUNT(*) AS count FROM analytics_pageviews WHERE created_at >= ? AND created_at < ? GROUP BY date",
        parameters: [moscowSqlOffset, start, end],
      },
      {
        key: 'leads' as const,
        sql: 'SELECT date(created_at,?) AS date,COUNT(*) AS count FROM leads WHERE created_at >= ? AND created_at < ? GROUP BY date',
        parameters: [moscowSqlOffset, fromIso, endIso],
      },
    ];
    for (const group of groups) {
      const rows = this.db.prepare(group.sql).all(...group.parameters) as {
        date: string;
        count: number;
      }[];
      for (const row of rows) {
        const day = daily.find((item) => item.date === row.date);
        if (day) day[group.key] = row.count;
      }
    }
    return {
      period: { days, from: dates[0], to: dates.at(-1)! },
      leads: { ...leads, sources: leadSources },
      traffic: {
        visits: visits.count,
        pageviews: views.count,
        daily,
        pages: this.db
          .prepare(
            'SELECT path,COUNT(*) AS pageviews,COUNT(DISTINCT visit_id) AS visits FROM analytics_pageviews WHERE created_at >= ? AND created_at < ? GROUP BY path ORDER BY pageviews DESC,path LIMIT 20',
          )
          .all(start, end) as AdminStatistics['traffic']['pages'],
        sources: this.db
          .prepare(
            'SELECT source,COUNT(*) AS visits FROM analytics_visits WHERE started_at >= ? AND started_at < ? GROUP BY source ORDER BY visits DESC,source LIMIT 20',
          )
          .all(start, end) as AdminStatistics['traffic']['sources'],
      },
    };
  }
}
