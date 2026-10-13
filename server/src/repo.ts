import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Doc } from './doc.js';

/** Where workspaces, link tokens and photos live. Files locally, Netlify Blobs when deployed. */
export interface Repo {
  load(id: string): Promise<{ doc: Doc; etag: string } | null>;
  /** Saves only if nobody else saved since `etag` (null means create). Returns false on a conflict. */
  save(doc: Doc, etag: string | null): Promise<boolean>;
  getLink(token: string): Promise<string | null>;
  putLink(token: string, ws: string): Promise<void>;
  putPhoto(id: string, bytes: Uint8Array, mime: string): Promise<void>;
  getPhoto(id: string): Promise<{ bytes: Uint8Array; mime: string } | null>;
}

/** Local repo. Pass no directory to keep everything in memory (tests). */
export class FileRepo implements Repo {
  private mem = new Map<string, string>();
  private bin = new Map<string, { bytes: Uint8Array; mime: string }>();
  constructor(private dir?: string) { if (dir) for (const s of ['ws', 'links', 'photos']) mkdirSync(join(dir, s), { recursive: true }) }

  private read(kind: string, key: string): string | null {
    if (!this.dir) return this.mem.get(`${kind}/${key}`) ?? null;
    const f = join(this.dir, kind, `${key}.json`);
    return existsSync(f) ? readFileSync(f, 'utf8') : null;
  }
  private write(kind: string, key: string, v: string) {
    if (!this.dir) { this.mem.set(`${kind}/${key}`, v); return }
    writeFileSync(join(this.dir, kind, `${key}.json`), v);
  }
  async load(id: string) {
    const raw = this.read('ws', id); if (!raw) return null;
    const doc = JSON.parse(raw) as Doc;
    return { doc, etag: String(doc.version) };
  }
  async save(doc: Doc, etag: string | null) {
    const cur = await this.load(doc.ws.id);
    if ((cur?.etag ?? null) !== etag) return false;
    doc.version = (cur?.doc.version ?? 0) + 1;
    this.write('ws', doc.ws.id, JSON.stringify(doc));
    return true;
  }
  async getLink(token: string) { return this.read('links', token) }
  async putLink(token: string, ws: string) { this.write('links', token, ws) }
  async putPhoto(id: string, bytes: Uint8Array, mime: string) {
    if (!this.dir) { this.bin.set(id, { bytes, mime }); return }
    writeFileSync(join(this.dir, 'photos', id), bytes);
    writeFileSync(join(this.dir, 'photos', `${id}.mime`), mime);
  }
  async getPhoto(id: string) {
    if (!this.dir) return this.bin.get(id) ?? null;
    const f = join(this.dir, 'photos', id);
    return existsSync(f) ? { bytes: readFileSync(f), mime: readFileSync(`${f}.mime`, 'utf8') } : null;
  }
}

/** Netlify Blobs. Strong consistency plus conditional writes keep concurrent requests safe. */
export async function blobsRepo(): Promise<Repo> {
  const { getStore } = await import('@netlify/blobs');
  const ws = getStore({ name: 'workspaces', consistency: 'strong' });
  const links = getStore({ name: 'links', consistency: 'strong' });
  const photos = getStore({ name: 'photos', consistency: 'strong' });
  return {
    async load(id) {
      const r = await ws.getWithMetadata(id, { type: 'json' });
      // Netlify returns an etag. The local emulator does not, so saves there are unconditional.
      return r?.data ? { doc: r.data as Doc, etag: r.etag ?? '' } : null;
    },
    async save(doc, etag) {
      doc.version = (doc.version ?? 0) + 1;
      if (etag === '') { await ws.setJSON(doc.ws.id, doc); return true }
      const r = await ws.setJSON(doc.ws.id, doc, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
      return r.modified;
    },
    async getLink(token) { return (await links.get(token, { type: 'text' })) ?? null },
    async putLink(token, id) { await links.set(token, id) },
    async putPhoto(id, bytes, mime) { await photos.set(id, new Blob([bytes as BlobPart]), { metadata: { mime } }) },
    async getPhoto(id) {
      const r = await photos.getWithMetadata(id, { type: 'arrayBuffer' });
      return r ? { bytes: new Uint8Array(r.data), mime: String(r.metadata.mime ?? 'image/jpeg') } : null;
    },
  };
}
