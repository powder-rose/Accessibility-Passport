import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { isScryptHash } from '../scripts/lib/admin-password.mjs';
import { isLoopbackOrigin, normalizeOrigin } from './origin';

export interface Config {
  production: boolean;
  host: string;
  port: number;
  databasePath: string;
  appOrigin?: string;
  trustProxy: number;
  adminPasswordHash: string;
  adminSessionSecret: string;
}
export function readConfig(): Config {
  if (existsSync('.env')) loadEnvFile('.env');
  const args = process.argv.slice(2);
  const argument = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const production =
    args.includes('--production') || process.env.NODE_ENV === 'production';
  const port = Number(argument('--port') || process.env.PORT || 5173);
  const trustProxy = Number(process.env.TRUST_PROXY || 0);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('Invalid PORT.');
  if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 10)
    throw new Error('Invalid TRUST_PROXY.');
  const appOrigin = process.env.APP_ORIGIN
    ? normalizeOrigin(process.env.APP_ORIGIN, 'APP_ORIGIN')
    : undefined;
  if (production && !appOrigin)
    throw new Error('Set APP_ORIGIN in .env before production startup.');
  if (
    production &&
    appOrigin &&
    new URL(appOrigin).protocol !== 'https:' &&
    !isLoopbackOrigin(appOrigin)
  )
    throw new Error(
      'Public production APP_ORIGIN must use HTTPS to protect contact details and documents.',
    );
  const scryptHash = process.env.ADMIN_PASSWORD_SCRYPT || '';
  const legacyHash = process.env.ADMIN_PASSWORD_SHA256 || '';
  const hash = scryptHash || legacyHash.toLowerCase();
  const secret = process.env.ADMIN_SESSION_SECRET || '';
  if (scryptHash && !isScryptHash(scryptHash))
    throw new Error('Invalid ADMIN_PASSWORD_SCRYPT.');
  if (!scryptHash && hash && !/^[a-f0-9]{64}$/.test(hash))
    throw new Error('Invalid ADMIN_PASSWORD_SHA256.');
  if (secret && secret.length < 32)
    throw new Error(
      'ADMIN_SESSION_SECRET must contain at least 32 characters.',
    );
  return {
    production,
    port,
    trustProxy,
    host: argument('--host') || process.env.HOST || '127.0.0.1',
    databasePath: resolve(process.env.DATABASE_PATH || './data/site.sqlite'),
    appOrigin,
    adminPasswordHash: hash,
    adminSessionSecret: secret,
  };
}
