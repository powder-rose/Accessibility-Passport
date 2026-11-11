export const statisticsPeriods = [7, 30, 90] as const;
export type StatisticsDays = (typeof statisticsPeriods)[number];

export interface DailyStatistics {
  date: string;
  visits: number;
  pageviews: number;
  leads: number;
}

export interface AdminStatistics {
  period: { days: StatisticsDays; from: string; to: string };
  leads: {
    total: number;
    today: number;
    period: number;
    sources: { source: string; count: number }[];
  };
  traffic: {
    visits: number;
    pageviews: number;
    daily: DailyStatistics[];
    pages: { path: string; pageviews: number; visits: number }[];
    sources: { source: string; visits: number }[];
  };
}

export interface PageView {
  id: string;
  token: string;
  path: string;
  referrer?: string;
  campaign?: string;
}

export const visitLifetime = 30 * 60 * 1000;
export const trafficRetentionDays = 90;
