import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { FileRepo } from './repo.js';
import { Service } from './service.js';
import { createApp } from './app.js';
import { pickReader } from './reader.js';

// Local server. On Netlify the same app runs as a function (netlify/functions/api.ts).
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = process.env.DATA_DIR ?? join(root, 'data');
const reader = pickReader();
const svc = new Service(new FileRepo(dataDir), { read: reader.read, engine: reader.engine });
const app = createApp(svc);

if (process.env.NODE_ENV === 'production') {
  const dist = join(root, 'web/dist');
  app.use('/*', serveStatic({ root: dist }));
  app.get('*', c => c.html(readFileSync(join(dist, 'index.html'), 'utf8')));
}

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`Challan Cash on http://localhost:${port}`);
  console.log(`Challan reader: ${reader.engine === 'scripted' ? 'scripted (set GEMINI_API_KEY to read real photos)' : reader.engine}`);
});
