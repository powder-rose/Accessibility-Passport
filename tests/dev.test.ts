import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

test(
  'actual dev command remains stable after Vite config loading, SSR requests and SQLite writes',
  { timeout: 30000 },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), 'passport-dev-test-'));
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );
    const command = packageJson.scripts.dev.split(' ');
    const executable =
      command.shift() === 'node' ? process.execPath : undefined;
    assert.ok(executable, 'The development command must start with Node.js.');
    let output = '';
    const child = spawn(executable, [...command, '--port', '0'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        APP_ORIGIN: '',
        HOST: '127.0.0.1',
        PORT: '0',
        DATABASE_PATH: join(directory, 'site.sqlite'),
        ADMIN_PASSWORD_SCRYPT: '',
        ADMIN_PASSWORD_SHA256: '',
        ADMIN_SESSION_SECRET: '',
      },
    });
    child.stdout!.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr!.on('data', (chunk) => {
      output += chunk.toString();
    });
    try {
      let origin = '';
      for (let attempt = 0; attempt < 100; attempt++) {
        origin =
          output.match(/Server ready at (http:\/\/127\.0\.0\.1:\d+)/)?.[1] ||
          '';
        if (origin) break;
        if (child.exitCode !== null)
          throw new Error('Dev server exited: ' + output);
        await delay(100);
      }
      assert.ok(origin, 'Dev server did not become ready: ' + output);
      for (let i = 0; i < 3; i++) {
        const page = await fetch(origin, { signal: AbortSignal.timeout(6000) });
        assert.equal(page.status, 200);
        assert.ok((await page.text()).includes('id="hero-title"'));
      }
      const response = await fetch(origin + '/api/leads', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: randomUUID(),
          source: 'contact',
          name: 'Проверка dev-сервера',
          phone: '+79990000000',
          email: '',
          consent: true,
          website: '',
          startedAt: Date.now() - 5000,
          pageUrl: origin + '/',
          utm: {},
        }),
        signal: AbortSignal.timeout(6000),
      });
      assert.equal(response.status, 200);
      await delay(2500);
      assert.equal(child.exitCode, null, output);
      assert.equal((output.match(/Server ready at/g) || []).length, 1, output);
      assert.doesNotMatch(output, /Restarting/);
      assert.equal(
        (await fetch(origin, { signal: AbortSignal.timeout(6000) })).status,
        200,
      );
    } finally {
      const exited = new Promise<void>((resolve) =>
        child.once('exit', () => resolve()),
      );
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        const stopped = await Promise.race([
          exited.then(() => true),
          delay(10000).then(() => false),
        ]);
        if (!stopped) {
          child.kill('SIGKILL');
          await exited;
        }
      }
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
