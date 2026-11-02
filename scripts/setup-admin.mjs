import { randomBytes, createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const filename = '.env';
let content = existsSync(filename) ? readFileSync(filename, 'utf8') : '';
if (/^ADMIN_(?:PASSWORD_SHA256|SESSION_SECRET)=.+$/m.test(content)) {
  throw new Error('CMS credentials already exist in .env. Existing credentials were preserved.');
}
const password = randomBytes(18).toString('base64url');
const hash = createHash('sha256').update(password).digest('hex');
const secret = randomBytes(32).toString('hex');
content = content.replace(/^ADMIN_(?:PASSWORD_SHA256|SESSION_SECRET)=.*\r?\n?/gm, '');
if (content && !content.endsWith('\n')) content += '\n';
content += 'ADMIN_PASSWORD_SHA256=' + hash + '\nADMIN_SESSION_SECRET=' + secret + '\n';
writeFileSync(filename, content, { mode: 0o600 });
console.log('CMS credentials saved in .env. Keep this file outside Git.');
console.log('Your new CMS password: ' + password);
console.log('Restart the server, then open /admin/. Save the password in your password manager.');
