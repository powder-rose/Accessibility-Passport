import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const pattern = /^scrypt:v1:([a-f0-9]{32}):([a-f0-9]{128})$/;
let active = 0;

export class PasswordBusyError extends Error {}

export function isScryptHash(value) {
  return typeof value === 'string' && pattern.test(value);
}

async function derive(password, salt) {
  if (
    typeof password !== 'string' ||
    !password ||
    Buffer.byteLength(password) > 4096
  )
    throw new Error('Invalid password input.');
  if (active >= 2)
    throw new PasswordBusyError('Password verification is busy.');
  active++;
  try {
    return await new Promise((resolve, reject) => {
      scrypt(
        password,
        salt,
        64,
        { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
        (error, key) => (error ? reject(error) : resolve(key)),
      );
    });
  } finally {
    active--;
  }
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt:v1:${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  const match = typeof encoded === 'string' ? pattern.exec(encoded) : null;
  if (!match) return false;
  const key = await derive(password, Buffer.from(match[1], 'hex'));
  return timingSafeEqual(key, Buffer.from(match[2], 'hex'));
}
