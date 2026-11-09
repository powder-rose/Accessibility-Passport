import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

async function boundedText(response, limit) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty response.');
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new Error('Response too large.');
      }
      chunks.push(value);
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(chunks),
    );
  } finally {
    reader.releaseLock();
  }
}

try {
  const { values } = parseArgs({
    options: {
      origin: { type: 'string' },
      'timeout-ms': { type: 'string', default: '5000' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(
      'Usage: npm run healthcheck -- [--origin http://127.0.0.1:5173] [--timeout-ms 5000]',
    );
  } else {
    if (existsSync('.env')) loadEnvFile('.env');
    const origin = new URL(
      values.origin || 'http://127.0.0.1:' + (process.env.PORT || '3000'),
    );
    const timeout = Number(values['timeout-ms']);
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash ||
      origin.pathname !== '/' ||
      !/^[1-9][0-9]*$/.test(values['timeout-ms']) ||
      !Number.isSafeInteger(timeout) ||
      timeout < 100 ||
      timeout > 30_000
    )
      throw new Error('Invalid healthcheck configuration.');
    // A single deadline covers both requests and their streamed response bodies.
    const signal = AbortSignal.timeout(timeout);
    const request = (path) =>
      fetch(new URL(path, origin), {
        redirect: 'manual',
        signal,
        headers: { 'Cache-Control': 'no-cache' },
      });
    const database = await request('/healthz');
    if (
      database.status !== 200 ||
      !/^application\/json(?:;|$)/i.test(
        database.headers.get('content-type') || '',
      )
    ) {
      await database.body?.cancel();
      throw new Error('Database readiness check failed.');
    }
    const result = JSON.parse(await boundedText(database, 1024));
    if (!result || result.ok !== true || Object.keys(result).length !== 1)
      throw new Error('Invalid readiness response.');
    const page = await request('/');
    if (
      page.status !== 200 ||
      !/^text\/html(?:;|$)/i.test(page.headers.get('content-type') || '')
    ) {
      await page.body?.cancel();
      throw new Error('Homepage response failed.');
    }
    const html = await boundedText(page, 2 * 1024 * 1024);
    if (
      !/\bid=["']root["']/.test(html) ||
      !/<h1(?:\s|>)/i.test(html) ||
      !/<script\b[^>]*\bid=["']page-data["']/i.test(html) ||
      /<!--app-(?:head|html|data)-->/i.test(html)
    )
      throw new Error('Homepage server rendering failed.');
    console.log('HEALTHCHECK_OK');
  }
} catch {
  // Do not emit response bodies, URLs, filesystem paths or native error details.
  console.error('HEALTHCHECK_FAILED');
  process.exitCode = 1;
}
