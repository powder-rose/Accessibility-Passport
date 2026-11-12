import { z } from 'zod';
import { MiB } from './attachments';
import { articleImageId } from '../features/articles/model';

export const storageLimits = { attachments: 512 * MiB, images: 256 * MiB };
export const imageGraceDays = 7;
export const cleanupBatchSize = 100;
export const storageWarningPercent = 80;

const usageSchema = z.object({
  bytes: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});
export const storageReportSchema = z.object({
  attachments: usageSchema,
  images: usageSchema,
});
export type StorageUsage = z.infer<typeof usageSchema>;
export type StorageReport = z.infer<typeof storageReportSchema>;
export const cleanupImageSchema = z.object({
  id: z.string().refine((value) => articleImageId.test(value)),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const cleanupPreviewSchema = z.object({
  images: z
    .array(
      cleanupImageSchema.extend({
        size: z.number().int().nonnegative(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        createdAt: z.string().datetime(),
      }),
    )
    .max(cleanupBatchSize),
  total: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
});
export type CleanupPreview = z.infer<typeof cleanupPreviewSchema>;
export type CleanupImage = z.infer<typeof cleanupImageSchema>;
export function storageLevel(usage: StorageUsage) {
  if (usage.bytes >= usage.limit) return 'full';
  return (usage.bytes / usage.limit) * 100 >= storageWarningPercent
    ? 'warning'
    : 'ok';
}
export function storageSize(bytes: number) {
  return `${(bytes / MiB).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} МиБ`;
}
