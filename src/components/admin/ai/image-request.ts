import { articleJson, articleRequest } from '../articles/api';

export type ImageJob = {
  id: string;
  status: 'running' | 'succeeded' | 'failed' | 'unknown' | 'expired';
  createdAt?: number | string;
  updatedAt?: number | string;
  dataUrl?: string;
  error?: string;
};
export function startImageJob(
  requestId: string,
  prompt: string,
  referenceDataUrls: string[],
): Promise<ImageJob> {
  return articleRequest<ImageJob>(
    '/api/admin/ai/image',
    articleJson('POST', { requestId, prompt, referenceDataUrls }),
    { timeoutMs: 120_000 },
  );
}
export function readImageJob(
  id: string,
  signal?: AbortSignal,
): Promise<ImageJob> {
  return articleRequest<ImageJob>(
    `/api/admin/ai/image-jobs/${encodeURIComponent(id)}`,
    { signal },
  );
}
export function listImageJobs(
  signal?: AbortSignal,
): Promise<{ jobs: ImageJob[] }> {
  return articleRequest<{ jobs: ImageJob[] }>('/api/admin/ai/image-jobs', {
    signal,
  });
}

export function canApplyImage(
  image: string,
  job: ImageJob | undefined,
): boolean {
  return Boolean(image && job?.status === 'succeeded' && job.dataUrl === image);
}
