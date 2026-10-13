import { blobsRepo } from '../../server/src/repo.js';
import { Service } from '../../server/src/service.js';
import { createApp } from '../../server/src/app.js';
import { pickReader } from '../../server/src/reader.js';

// The whole API as one Netlify Function. Data and photos live in Netlify Blobs.
let app: ReturnType<typeof createApp> | null = null;

export default async (req: Request) => {
  if (!app) {
    const reader = pickReader();
    app = createApp(new Service(await blobsRepo(), { read: reader.read, engine: reader.engine }));
  }
  return app.fetch(req);
};

export const config = { path: '/api/*' };
