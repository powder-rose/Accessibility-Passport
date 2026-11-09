import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { Config } from '../config';
import type { Store } from '../db/store';
import type { AdminCredential } from './repository';
import {
  hashPassword,
  isScryptHash,
  verifyPassword,
} from '../../scripts/lib/admin-password.mjs';

export const adminSessionLifetime = 8 * 60 * 60 * 1000;
const tokenPattern = /^v1\.([a-f0-9]{32})\.([a-f0-9]{64})$/;

export function credentialKey(config: Config) {
  return createHmac('sha256', config.adminSessionSecret)
    .update('osi-admin-credential-v1\0' + config.adminPasswordHash)
    .digest('hex');
}

export function configureAdmin(config: Config, store: Store) {
  if (!config.adminPasswordHash || !config.adminSessionSecret) {
    store.auth.revokeAll();
    return;
  }
  if (
    !isScryptHash(config.adminPasswordHash) &&
    !/^[a-f0-9]{64}$/.test(config.adminPasswordHash)
  )
    throw new Error('Invalid administrator password configuration.');
  store.auth.configure(
    credentialKey(config),
    isScryptHash(config.adminPasswordHash) ? config.adminPasswordHash : null,
  );
}

export async function authenticatePassword(
  password: string,
  config: Config,
  store: Store,
): Promise<AdminCredential | undefined> {
  const sourceHash = credentialKey(config);
  const credential = store.auth.credential(sourceHash);
  if (!credential) throw new Error('Administrator configuration changed.');
  if (credential.passwordHash) {
    return (await verifyPassword(password, credential.passwordHash))
      ? credential
      : undefined;
  }
  // Apply the same KDF cost to incorrect legacy attempts. Never persist their
  // derived hashes. The configured SHA-256 is used only until the first login.
  const upgraded = await hashPassword(password);
  const legacy = createHash('sha256').update(password).digest();
  if (
    !/^[a-f0-9]{64}$/.test(config.adminPasswordHash) ||
    !timingSafeEqual(legacy, Buffer.from(config.adminPasswordHash, 'hex'))
  )
    return undefined;
  if (!store.auth.upgradePassword(sourceHash, credential.generation, upgraded))
    throw new Error('Administrator configuration changed. Retry login.');
  return { ...credential, passwordHash: upgraded };
}

export function readAdminToken(request: Request) {
  const values = (request.headers.get('cookie') || '')
    .split(';')
    .map((value) => value.trim())
    .filter((value) => value.startsWith('osi_admin='));
  if (values.length !== 1) return undefined;
  const match = tokenPattern.exec(values[0].slice(10));
  return match ? { id: match[1], verifier: match[2] } : undefined;
}

function verifierHash(verifier: string, config: Config) {
  return createHmac('sha256', config.adminSessionSecret)
    .update('osi-admin-session-v1\0' + verifier)
    .digest('hex');
}

export function createAdminSession(
  config: Config,
  store: Store,
  credential: AdminCredential,
) {
  const id = randomBytes(16).toString('hex');
  const verifier = randomBytes(32).toString('hex');
  const now = Date.now();
  if (
    !store.auth.createSession(
      credentialKey(config),
      credential,
      id,
      verifierHash(verifier, config),
      now + adminSessionLifetime,
      now,
    )
  )
    throw new Error('Administrator configuration changed. Retry login.');
  return `v1.${id}.${verifier}`;
}

export function isAdminAuthenticated(
  request: Request,
  config: Config,
  store: Store,
) {
  if (!config.adminPasswordHash || !config.adminSessionSecret) return false;
  const token = readAdminToken(request);
  if (!token) return false;
  const session = store.auth.session(
    credentialKey(config),
    token.id,
    Date.now(),
  );
  if (!session || !/^[a-f0-9]{64}$/.test(session.verifierHash)) return false;
  return timingSafeEqual(
    Buffer.from(session.verifierHash, 'hex'),
    Buffer.from(verifierHash(token.verifier, config), 'hex'),
  );
}

export function revokeAdminSession(
  request: Request,
  config: Config,
  store: Store,
) {
  const token = readAdminToken(request);
  if (token && config.adminSessionSecret)
    store.auth.revokeSession(token.id, verifierHash(token.verifier, config));
}
