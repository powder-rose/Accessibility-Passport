import type { ArticleRepository } from './repository';

export const articleScheduleInterval = 15_000;

export function startArticleScheduler(
  articles: Pick<ArticleRepository, 'publishDue'>,
  onError: (error: unknown) => void,
) {
  function tick() {
    try {
      articles.publishDue();
    } catch (error) {
      onError(error);
    }
  }
  tick();
  const timer = setInterval(tick, articleScheduleInterval);
  timer.unref();
  return () => clearInterval(timer);
}
