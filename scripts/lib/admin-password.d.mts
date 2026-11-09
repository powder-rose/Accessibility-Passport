export class PasswordBusyError extends Error {}
export function isScryptHash(value: unknown): value is string;
export function hashPassword(password: string): Promise<string>;
export function verifyPassword(
  password: string,
  encoded: unknown,
): Promise<boolean>;
