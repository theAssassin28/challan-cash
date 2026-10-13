import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from './store.js';
import { Service } from './service.js';
import { createApp } from './app.js';
import type { Snapshot } from '@cc/shared';

const settle = () => new Promise(r => setTimeout(r, 30));

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'cc-'));
  const store = new Store(':memory:');
  const svc = new Service(store, { delayScale: 0 });
  const app = createApp(svc, { uploadDir: join(dir, 'up') });
  const agent = request.agent(app);
  return { store, svc, agent, app };
}
const state = async (agent: ReturnType<typeof setup>['agent']) => (await agent.get('/api/state').expect(200)).body as Snapshot;

describe('Endurance: driver photo to cash', () => {
  it('runs the whole flow and splits the buyer payment', async () => {
    const { agent, store, app } = setup();
    let s = await state(agent);
    expect(s.dispatches.a.status).toBe('transit');

    const { body: link } = await agent.post('/api/dispatches/a/request-photo').expect(200);
    expect(link.url).toMatch(/\/c\/[\w-]+$/);
    s = await state(agent);
    expect(s.dispatches.a.status).toBe('asked');
    expect(s.chats.r.at(-1)!.link!.token).toBe(link.token);

    // Driver opens the link with no cookie
    const anon = request(app);
    expect((await anon.get(`/api/capture/${link.token}`).expect(200)).body.dispatch.sh).toBe('Endurance');
    await anon.post(`/api/capture/${link.token}/photo`).expect(200);
    await anon.post(`/api/capture/${link.token}/photo`).expect(410); // works once
    await settle();

    s = await state(agent);
    expect(s.dispatches.a.status).toBe('photo');
    expect(s.dispatches.a.recd).toBe(960);
    const rd = (await agent.get('/api/dispatches/a/readings').expect(200)).body;
    expect(rd.status).toBe('done');
    expect(rd.data.map((r: { label: string }) => r.label)).toContain('Pen note');

    await agent.post('/api/dispatches/a/proof').expect(200);
    await settle();
    s = await state(agent);
    expect(s.dispatches.a.status).toBe('proof');
    expect(s.dispatches.a.cnPosted).toBe(true);
    const mail = (await agent.get('/api/dispatches/a/email').expect(200)).body;
    expect(mail.to).toBe('ap.chakan@endurance.example');
    expect(mail.body).toContain('₹2,40,000');

    const offer = (await agent.get('/api/dispatches/a/offer').expect(200)).body;
    expect(offer).toMatchObject({ nowCap: 120000, amount: 120000, t2: 72000, charges: 3840 });
    await agent.post('/api/dispatches/a/advance').send({ amount: 999 }).expect(400);
    await agent.post('/api/dispatches/a/advance').send({ amount: 120000 }).expect(200);
    s = await state(agent);
    expect(s.dispatches.a).toMatchObject({ status: 'adv', amt: 120000, t2Pending: true });
    expect(s.bal).toBe(318450 + 120000);

    await agent.post('/api/sim/a/booked').expect(200);
    s = await state(agent);
    expect(s.dispatches.a).toMatchObject({ booked: true, amt: 192000, charges: 3840, t2Pending: false });

    await agent.post('/api/sim/a/pay').expect(200);
    s = await state(agent);
    expect(s.dispatches.a.status).toBe('paid');
    expect(s.date).toBe('26 Nov');
    // 2,40,000 payable - 1,92,000 advance - 3,840 charges
    expect(s.pays[0].amt).toBe(44160);
    expect(s.bal).toBe(318450 + 192000 + 44160);
    expect(store.loans(s.workspace).every(l => l.status === 'repaid')).toBe(true);
  });

  it('keeps the record append-only', async () => {
    const { agent, store } = setup();
    const s = await state(agent);
    expect(() => store.db.prepare('UPDATE audit_log SET text=? WHERE ws=?').run('x', s.workspace)).toThrow(/append-only/);
    expect(() => store.db.prepare('DELETE FROM audit_log WHERE ws=?').run(s.workspace)).toThrow(/append-only/);
  });
});

describe('Sundaram: new buyer', () => {
  it('caps the advance at 50% and waits for buyer confirmation', async () => {
    const { agent } = setup();
    await agent.post('/api/demo/reset').send({ path: 'b', unlocked: true }).expect(200);
    await agent.post('/api/dispatches/b/request-photo').expect(409);
    await agent.post('/api/dispatches/b/photo').expect(200);
    await settle();
    await agent.post('/api/dispatches/b/proof').expect(200);
    const offer = (await agent.get('/api/dispatches/b/offer').expect(200)).body;
    expect(offer).toMatchObject({ nowCap: 60000, t2: 0 });
    await agent.post('/api/dispatches/b/advance').send({ amount: 60000 }).expect(200);
    let s = await state(agent);
    expect(s.dispatches.b.status).toBe('await');
    await agent.post('/api/sim/b/confirm').expect(200);
    s = await state(agent);
    expect(s.dispatches.b).toMatchObject({ status: 'adv', booked: true, amt: 60000, charges: 1500 });
  });
});

describe('Pune Precision: stale challan', () => {
  it('Anil replies by himself after the link is sent', async () => {
    const { agent } = setup();
    await agent.post('/api/demo/reset').send({ path: 'c', unlocked: true }).expect(200);
    await agent.post('/api/dispatches/c/request-photo').expect(200);
    await settle();
    const s = await state(agent);
    expect(s.dispatches.c.status).toBe('photo');
    expect(s.chats.a.at(-1)!.t).toMatch(/still in the truck/);
  });

  it('pays in full with no advance', async () => {
    const { agent } = setup();
    await agent.post('/api/demo/reset').send({ path: 'c', unlocked: true }).expect(200);
    await agent.post('/api/sim/c/pay').expect(409);
    await agent.post('/api/dispatches/c/photo').expect(200);
    await settle();
    await agent.post('/api/dispatches/c/proof').expect(200);
    await agent.post('/api/sim/c/pay').expect(200);
    const s = await state(agent);
    expect(s.dispatches.c.status).toBe('paid');
    expect(s.pays[0].amt).toBe(380000);
  });
});
