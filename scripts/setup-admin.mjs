import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  fsyncSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { parseEnv } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { hashPassword, isScryptHash } from './lib/admin-password.mjs';

async function currentPassword() {
  const silent = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const reader = createInterface({
    input: process.stdin,
    output: silent,
    terminal: Boolean(process.stdin.isTTY),
  });
  const controller = new AbortController();
  const cancel = () => controller.abort();
  reader.on('SIGINT', cancel);
  reader.once('close', cancel);
  process.stdout.write('Current CMS password (hidden): ');
  try {
    return await reader.question('', { signal: controller.signal });
  } finally {
    reader.off('close', cancel);
    reader.off('SIGINT', cancel);
    reader.close();
    silent.end();
    process.stdout.write('\n');
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (
    args.length > 1 ||
    (args.length && !['--rotate', '--migrate'].includes(args[0]))
  )
    throw new Error('Use admin:setup, admin:migrate or admin:rotate-password.');
  const mode = args[0] || 'setup';
  const filename = '.env';
  const lock = '.admin-setup.lock';
  const temporary = '.admin-setup-' + randomBytes(12).toString('hex') + '.tmp';
  const descriptor = openSync(lock, 'wx', 0o600);
  try {
    if (existsSync(filename) && !lstatSync(filename).isFile())
      throw new Error('.env must be a regular file, not a symbolic link.');
    const existed = existsSync(filename);
    const original = existed ? readFileSync(filename, 'utf8') : '';
    const values = parseEnv(original);
    const configured = Boolean(
      values.ADMIN_PASSWORD_SCRYPT ||
      values.ADMIN_PASSWORD_SHA256 ||
      values.ADMIN_SESSION_SECRET,
    );
    if (mode === 'setup' && configured)
      throw new Error(
        'CMS credentials already exist. Existing credentials were preserved.',
      );
    if (mode !== 'setup' && !configured)
      throw new Error('Configure CMS first with npm run admin:setup.');
    let encoded;
    let secret;
    let generatedPassword;
    if (mode === '--migrate') {
      secret = values.ADMIN_SESSION_SECRET || '';
      if (secret.length < 32)
        throw new Error('Existing session secret is missing or invalid.');
      encoded = values.ADMIN_PASSWORD_SCRYPT || '';
      if (encoded) {
        if (!isScryptHash(encoded))
          throw new Error('Invalid existing ADMIN_PASSWORD_SCRYPT.');
        if (!values.ADMIN_PASSWORD_SHA256) {
          console.log('ADMIN_PASSWORD_ALREADY_MIGRATED');
          return;
        }
      } else {
        const legacy = values.ADMIN_PASSWORD_SHA256 || '';
        if (!/^[a-f0-9]{64}$/i.test(legacy))
          throw new Error('Invalid existing ADMIN_PASSWORD_SHA256.');
        const password = await currentPassword();
        if (
          !timingSafeEqual(
            createHash('sha256').update(password).digest(),
            Buffer.from(legacy, 'hex'),
          )
        )
          throw new Error(
            'Password does not match. Existing credentials were preserved.',
          );
        encoded = await hashPassword(password);
      }
    } else {
      generatedPassword = randomBytes(18).toString('base64url');
      encoded = await hashPassword(generatedPassword);
      secret = randomBytes(32).toString('hex');
    }
    const keys =
      mode === '--migrate'
        ? 'PASSWORD_SCRYPT|PASSWORD_SHA256'
        : 'PASSWORD_SCRYPT|PASSWORD_SHA256|SESSION_SECRET';
    let content = original.replace(
      new RegExp(
        '^[ \\t]*(?:export[ \\t]+)?ADMIN_(?:' +
          keys +
          ')[ \\t]*=.*(?:\\r?\\n|$)',
        'gm',
      ),
      '',
    );
    if (content && !content.endsWith('\n')) content += '\n';
    content += 'ADMIN_PASSWORD_SCRYPT=' + encoded + '\n';
    if (mode !== '--migrate')
      content += 'ADMIN_SESSION_SECRET=' + secret + '\n';
    const updated = parseEnv(content);
    const managed = new Set([
      'ADMIN_PASSWORD_SCRYPT',
      'ADMIN_PASSWORD_SHA256',
      'ADMIN_SESSION_SECRET',
    ]);
    for (const key of new Set([
      ...Object.keys(values),
      ...Object.keys(updated),
    ])) {
      if (!managed.has(key) && values[key] !== updated[key])
        throw new Error(
          'Non-credential settings would change. Existing .env was preserved.',
        );
    }
    if (
      updated.ADMIN_PASSWORD_SCRYPT !== encoded ||
      updated.ADMIN_PASSWORD_SHA256 ||
      updated.ADMIN_SESSION_SECRET !== secret
    )
      throw new Error(
        'Credential serialization failed. Existing .env was preserved.',
      );
    writeFileSync(temporary, content, { mode: 0o600, flag: 'wx' });
    const file = openSync(temporary, 'r+');
    try {
      fsyncSync(file);
    } finally {
      closeSync(file);
    }
    if (
      existsSync(filename) !== existed ||
      (existed &&
        (!lstatSync(filename).isFile() ||
          readFileSync(filename, 'utf8') !== original))
    )
      throw new Error(
        '.env changed during setup. Existing changes were preserved.',
      );
    renameSync(temporary, filename);
    console.log('CMS credentials saved in .env. Keep this file outside Git.');
    if (generatedPassword)
      console.log('Your new CMS password: ' + generatedPassword);
    else console.log('ADMIN_PASSWORD_MIGRATED (your password is unchanged)');
    console.log(
      'Restart Node.js, or recreate the Docker container with the new environment. Save generated passwords in your password manager.',
    );
  } finally {
    closeSync(descriptor);
    rmSync(temporary, { force: true });
    rmSync(lock, { force: true });
  }
}

try {
  await main();
} catch (error) {
  const message =
    error instanceof Error && !error.message.includes('\n')
      ? error.message
      : 'Credential setup failed.';
  console.error('ADMIN_SETUP_ERROR: ' + message);
  process.exitCode = 1;
}
