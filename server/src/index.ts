import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { Store } from './store.js';
import { Service } from './service.js';
import { createApp, loadPhoto } from './app.js';
import { claudeEnabled, claudeRead } from './reader.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = process.env.DATA_DIR ?? join(root, 'data');
const uploadDir = join(dataDir, 'uploads');

const store = new Store(join(dataDir, 'challan-cash.db'));
const svc = new Service(store, { read: claudeEnabled() ? claudeRead : undefined, loadPhoto: loadPhoto(uploadDir) });
const app = createApp(svc, { uploadDir, webDist: process.env.NODE_ENV === 'production' ? join(root, 'web/dist') : undefined });

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`Challan Cash API on http://localhost:${port}`);
  console.log(`Challan reader: ${claudeEnabled() ? 'Claude (real photos), scripted (demo shots)' : 'scripted (set ANTHROPIC_API_KEY to read real photos)'}`);
});
