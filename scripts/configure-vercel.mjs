import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
let existingBridge = '';
try {
  const text = await readFile('.env.bridge', 'utf8');
  existingBridge =
    text.match(
      /^TRADEFLY_BRIDGE_TOKEN\s*=\s*["']?([A-Za-z0-9_-]{32,})["']?\s*$/m,
    )?.[1] ?? '';
} catch {}
const content = `# Fill in the URL and token from your free Turso database.\nTURSO_DATABASE_URL=\nTURSO_AUTH_TOKEN=\n\n# Copy these four settings into Vercel; keep this file private.\nTRADEFLY_OWNER_KEY=${randomBytes(32).toString('base64url')}\nTRADEFLY_BRIDGE_TOKEN=${existingBridge || randomBytes(32).toString('base64url')}\n`;
try {
  await writeFile('.env.local', content, { flag: 'wx', mode: 0o600 });
  console.log(
    'Created private .env.local with owner and bridge keys. Add the Turso URL/token, then run npm run db:migrate.',
  );
} catch (error) {
  if (error.code === 'EEXIST')
    console.log(
      '.env.local already exists; left it unchanged. Use .env.example to add missing settings.',
    );
  else throw error;
}
