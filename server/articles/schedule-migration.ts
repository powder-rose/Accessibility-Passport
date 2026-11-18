export const articleScheduleSchema = `
  ALTER TABLE articles ADD COLUMN scheduled_at TEXT;
  CREATE INDEX articles_schedule_idx ON articles(scheduled_at,id)
    WHERE status='draft' AND deleted_at IS NULL AND scheduled_at IS NOT NULL;
`;
