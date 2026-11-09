import { z } from 'zod';

const cursorSchema = z
  .object({
    createdAt: z.string().min(1).max(64),
    id: z.string().min(1).max(128),
  })
  .strict();

export type LeadCursor = z.infer<typeof cursorSchema>;
export interface LeadQuery {
  limit: number;
  cursor?: LeadCursor;
}

export function encodeLeadCursor(cursor: LeadCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function parseLeadQuery(url: URL): LeadQuery {
  const params = url.searchParams;
  if (params.getAll('limit').length > 1 || params.getAll('cursor').length > 1)
    throw new Error('Duplicate pagination parameter.');
  const limit = params.get('limit') ?? '100';
  if (!/^[1-9]\d{0,2}$/.test(limit) || Number(limit) > 100)
    throw new Error('Invalid page size.');
  const encoded = params.get('cursor');
  if (encoded === null) return { limit: Number(limit) };
  if (encoded.length > 512 || !/^[a-zA-Z0-9_-]+$/.test(encoded))
    throw new Error('Invalid cursor.');
  const decoded = Buffer.from(encoded, 'base64url');
  if (decoded.toString('base64url') !== encoded)
    throw new Error('Invalid cursor encoding.');
  return {
    limit: Number(limit),
    cursor: cursorSchema.parse(JSON.parse(decoded.toString('utf8'))),
  };
}
