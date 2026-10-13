import { describe, expect, it } from 'vitest';
import type { Snapshot } from '@cc/shared';
import { FileRepo } from './repo.js';
import { Service } from './service.js';
import { createApp } from './app.js';
import { assertAppendOnly } from './doc.js';

/** A tiny client that keeps the workspace cookie, like a browser. */
function setup() {
  const repo = new FileRepo();
  const svc = new Service(repo, { delayScale: 0 });
  const app = createApp(svc);
  const client = (jar = true) => {
    let cookie = '';
    const call = async (method: string, path: string, body?: unknown) => {
      const headers: Record<string, string> = {};
      if (cookie) headers.cookie = cookie;
      if (body !== undefined) headers['content-type'] = 'application/json';
      const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const set = res.headers.get('set-cookie');
      if (jar && set) cookie = set.split(';')[0];
      return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text() };
    };
    return {
      get: (p: string) => call('GET', p),
      post: (p: string, b?: unknown) => call('POST', p, b),
      state: async () => (await call('GET', '/api/state')).body as Snapshot,
    };
  };
  return { repo, svc, client };
}

describe('Endurance: driver photo to cash', () => {
  it('runs the whole flow and splits the buyer payment', async () => {
    const { client, repo } = setup();
    const owner = client();
    let s = await owner.state();
    expect(s.dispatches.a.status).toBe('transit');

    const link = (await owner.post('/api/dispatches/a/request-photo')).body;
    expect(link.url).toMatch(/\/c\/[\w-]+$/);
    s = await owner.state();
    expect(s.dispatches.a.status).toBe('asked');
    expect(s.chats.r.at(-1)!.link!.token).toBe(link.token);
    expect(s.notices.some(n => n.phone === 'r')).toBe(true);

    // Driver opens the link with no cookie
    const driver = client(false);
    expect((await driver.get(`/api/capture/${link.token}`)).body.dispatch.sh).toBe('Endurance');
    expect((await driver.post(`/api/capture/${link.token}/photo`)).status).toBe(200);
    expect((await driver.post(`/api/capture/${link.token}/photo`)).status).toBe(410); // works once

    s = await owner.state();
    expect(s.dispatches.a.status).toBe('photo');
    expect(s.dispatches.a.recd).toBe(960);
    const rd = (await owner.get('/api/dispatches/a/readings')).body;
    expect(rd.status).toBe('done');
    expect(rd.data.map((r: { label: string }) => r.label)).toContain('Pen note');

    expect((await owner.post('/api/dispatches/a/proof')).status).toBe(200);
    s = await owner.state(); // the clerk's credit note is due now and runs on this read
    expect(s.dispatches.a.status).toBe('proof');
    expect(s.dispatches.a.cnPosted).toBe(true);
    const mail = (await owner.get('/api/dispatches/a/email')).body;
    expect(mail.to).toBe('ap.chakan@endurance.example');
    expect(mail.body).toContain('₹2,40,000');

    const offer = (await owner.get('/api/dispatches/a/offer')).body;
    expect(offer).toMatchObject({ nowCap: 120000, amount: 120000, t2: 72000, charges: 3840 });
    expect((await owner.post('/api/dispatches/a/advance', { amount: 999 })).status).toBe(400);
    expect((await owner.post('/api/dispatches/a/advance', { amount: 120000 })).status).toBe(200);
    s = await owner.state();
    expect(s.dispatches.a).toMatchObject({ status: 'adv', amt: 120000, t2Pending: true });
    expect(s.bal).toBe(318450 + 120000);

    await owner.post('/api/sim/a/booked');
    s = await owner.state();
    expect(s.dispatches.a).toMatchObject({ booked: true, amt: 192000, charges: 3840, t2Pending: false });

    await owner.post('/api/sim/a/pay');
    s = await owner.state();
    expect(s.dispatches.a.status).toBe('paid');
    expect(s.date).toBe('26 Nov');
    // 2,40,000 payable - 1,92,000 advance - 3,840 charges
    expect(s.pays[0].amt).toBe(44160);
    expect(s.bal).toBe(318450 + 192000 + 44160);
    const doc = (await repo.load(s.workspace))!.doc;
    expect(doc.loans.every(l => l.status === 'repaid')).toBe(true);
  });

  it('keeps the record append-only', async () => {
    const { client, repo } = setup();
    const s = await client().state();
    const prev = (await repo.load(s.workspace))!.doc, next = structuredClone(prev);
    next.log[0].text = 'changed';
    expect(() => assertAppendOnly(prev, next)).toThrow(/append-only/);
    next.log = next.log.slice(1);
    expect(() => assertAppendOnly(prev, next)).toThrow(/append-only/);
  });

  it('refuses a stale save', async () => {
    const { client, repo } = setup();
    const s = await client().state();
    const got = (await repo.load(s.workspace))!;
    expect(await repo.save(structuredClone(got.doc), got.etag)).toBe(true);
    expect(await repo.save(structuredClone(got.doc), got.etag)).toBe(false);
  });
});

describe('Sundaram: new buyer', () => {
  it('caps the advance at 50% and waits for buyer confirmation', async () => {
    const owner = setup().client();
    await owner.post('/api/demo/reset', { path: 'b', unlocked: true });
    expect((await owner.post('/api/dispatches/b/request-photo')).status).toBe(409);
    expect((await owner.post('/api/dispatches/b/photo')).status).toBe(200);
    await owner.post('/api/dispatches/b/proof');
    const offer = (await owner.get('/api/dispatches/b/offer')).body;
    expect(offer).toMatchObject({ nowCap: 60000, t2: 0 });
    await owner.post('/api/dispatches/b/advance', { amount: 60000 });
    let s = await owner.state();
    expect(s.dispatches.b.status).toBe('await');
    await owner.post('/api/sim/b/confirm');
    s = await owner.state();
    expect(s.dispatches.b).toMatchObject({ status: 'adv', booked: true, amt: 60000, charges: 1500 });
  });
});

describe('Pune Precision: stale challan', () => {
  it('Anil replies by himself after the link is sent', async () => {
    const owner = setup().client();
    await owner.post('/api/demo/reset', { path: 'c', unlocked: true });
    await owner.post('/api/dispatches/c/request-photo');
    const s = await owner.state();
    expect(s.dispatches.c.status).toBe('photo');
    expect(s.chats.a.at(-1)!.t).toMatch(/still in the truck/);
  });

  it('pays in full with no advance', async () => {
    const owner = setup().client();
    await owner.post('/api/demo/reset', { path: 'c', unlocked: true });
    expect((await owner.post('/api/sim/c/pay')).status).toBe(409);
    await owner.post('/api/dispatches/c/photo');
    await owner.post('/api/dispatches/c/proof');
    expect((await owner.post('/api/sim/c/pay')).status).toBe(200);
    const s = await owner.state();
    expect(s.dispatches.c.status).toBe('paid');
    expect(s.pays[0].amt).toBe(380000);
  });
});
