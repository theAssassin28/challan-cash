import { Hono, type Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import QRCode from 'qrcode';
import { z } from 'zod';
import { CLERK, LENDER, MERCHANT, R, cn, inr, invNo, type Key } from '../../shared/src/index.js';
import { HttpError, Service } from './service.js';

const COOKIE = 'cc_ws';
const KeyP = z.enum(['a', 'b', 'c']);
const IMAGE = /^image\/(jpeg|png|webp|gif|heic|heif)$/;
const MAX_PHOTO = 5.5 * 1024 * 1024; // Netlify Functions accept up to 6 MB per request

export function createApp(svc: Service) {
  const app = new Hono();

  const wsOf = async (c: Context): Promise<string> => {
    const id = getCookie(c, COOKIE);
    if (id && /^[\w-]+$/.test(id) && (await svc.exists(id))) return id;
    const fresh = await svc.create();
    remember(c, fresh);
    return fresh;
  };
  const remember = (c: Context, id: string) => setCookie(c, COOKIE, id, { httpOnly: true, sameSite: 'Lax', maxAge: 30 * 86400, path: '/', secure: new URL(c.req.url).protocol === 'https:' });
  const key = (c: Context) => KeyP.parse(c.req.param('k')) as Key;
  const origin = (c: Context) => process.env.PUBLIC_URL || new URL(c.req.url).origin;
  const ok = (c: Context, out?: unknown) => c.json(out ?? { ok: true });
  const photoOf = async (c: Context) => {
    if (!(c.req.header('content-type') ?? '').includes('multipart/form-data')) return { simulated: true as const };
    const f = (await c.req.parseBody()).photo;
    if (!(f instanceof File)) return { simulated: true as const };
    if (!IMAGE.test(f.type)) throw new HttpError(400, 'Send a photo (JPEG, PNG or WebP)');
    if (f.size > MAX_PHOTO) throw new HttpError(413, 'Photo is too large');
    return { simulated: false as const, bytes: new Uint8Array(await f.arrayBuffer()), mime: f.type };
  };

  /* ---------- owner app ---------- */
  app.get('/api/state', async c => ok(c, await svc.snapshot(await wsOf(c))));
  app.post('/api/demo/reset', async c => {
    const { path, unlocked } = z.object({ path: KeyP.default('a'), unlocked: z.boolean().default(false) }).parse(await c.req.json().catch(() => ({})));
    const id = await svc.create(path, unlocked); remember(c, id);
    return ok(c, await svc.snapshot(id));
  });
  app.post('/api/demo/unlock', async c => ok(c, await svc.unlock(await wsOf(c))));

  app.post('/api/dispatches/:k/request-photo', async c => {
    const { token } = await svc.requestPhoto(await wsOf(c), key(c), origin(c));
    return ok(c, { token, url: `${origin(c)}/c/${token}` });
  });
  app.post('/api/dispatches/:k/remind', async c => ok(c, await svc.remind(await wsOf(c), key(c))));
  app.get('/api/dispatches/:k/link', async c => {
    const l = await svc.latestLink(await wsOf(c), key(c));
    return ok(c, l ? { token: l.token, url: `${origin(c)}/c/${l.token}`, used: !!l.used_at } : null);
  });
  app.post('/api/dispatches/:k/photo', async c => ok(c, await svc.selfPhoto(await wsOf(c), key(c), await photoOf(c))));
  app.get('/api/dispatches/:k/readings', async c => ok(c, await svc.readings(await wsOf(c), key(c))));
  app.post('/api/dispatches/:k/read', async c => ok(c, await svc.readNow(await wsOf(c), key(c))));
  app.patch('/api/dispatches/:k/received', async c => {
    const { qty } = z.object({ qty: z.number() }).parse(await c.req.json());
    return ok(c, await svc.setReceived(await wsOf(c), key(c), qty));
  });
  app.post('/api/dispatches/:k/proof', async c => ok(c, await svc.sendProof(await wsOf(c), key(c))));
  app.get('/api/dispatches/:k/email', async c => ok(c, await svc.emailView(await wsOf(c), key(c))));
  app.get('/api/dispatches/:k/offer', async c => ok(c, await svc.offer(await wsOf(c), key(c), Number(c.req.query('amount')) || undefined)));
  app.post('/api/dispatches/:k/advance', async c => {
    const { amount } = z.object({ amount: z.number().int().positive() }).parse(await c.req.json());
    return ok(c, await svc.takeAdvance(await wsOf(c), key(c), amount));
  });
  app.post('/api/dispatches/:k/skip-advance', async c => ok(c, await svc.skipAdvance(await wsOf(c), key(c))));
  app.get('/api/dispatches/:k/record', async c => c.html(await recordPage(svc, await wsOf(c), key(c))));
  app.get('/api/loans', async c => ok(c, await svc.loans(await wsOf(c))));

  /* ---------- stand-ins for the buyer's accounts team ---------- */
  app.post('/api/sim/:k/booked', async c => ok(c, await svc.bookAck(await wsOf(c), key(c))));
  app.post('/api/sim/:k/confirm', async c => ok(c, await svc.buyerConfirms(await wsOf(c), key(c))));
  app.post('/api/sim/:k/pay', async c => ok(c, await svc.buyerPays(await wsOf(c), key(c))));

  /* ---------- driver's one-time link (no login, no cookie) ---------- */
  app.get('/api/capture/:token', async c => ok(c, await svc.captureInfo(c.req.param('token'))));
  app.post('/api/capture/:token/photo', async c => ok(c, await svc.capture(c.req.param('token'), await photoOf(c))));
  app.get('/api/capture/:token/qr.svg', async c => {
    await svc.captureInfo(c.req.param('token'));
    const svg = await QRCode.toString(`${origin(c)}/c/${c.req.param('token')}`, { type: 'svg', margin: 1 });
    return c.body(svg, 200, { 'Content-Type': 'image/svg+xml' });
  });

  app.get('/api/photos/:id', async c => {
    const p = await svc.photoFor(await wsOf(c), c.req.param('id'));
    if (!p) return c.body(null, 404);
    return c.body(p.bytes as unknown as ArrayBuffer, 200, { 'Content-Type': p.mime, 'Cache-Control': 'private, max-age=86400' });
  });

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400);
    if (err instanceof z.ZodError) return c.json({ error: 'Invalid request', issues: err.issues }, 400);
    console.error(err);
    return c.json({ error: 'Something went wrong' }, 500);
  });
  return app;
}

async function recordPage(svc: Service, ws: string, k: Key) {
  const d = (await svc.snapshot(ws)).dispatches[k];
  const e = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const rows = d.log.map(l => `<tr><td>${e(l.at)}</td><td>${e(l.text)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Record ${e(d.id)}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;color:#131b31;max-width:760px;margin:32px auto;padding:0 16px}h1{font-size:20px}table{width:100%;border-collapse:collapse}td{border-top:1px solid #dde;padding:6px 8px;vertical-align:top}td:first-child{white-space:nowrap;color:#566480}.m{color:#566480}</style></head>
<body><h1>Record · ${e(d.id)}</h1><p class="m">${e(MERCHANT.name)} · GSTIN ${MERCHANT.gstin}<br>Buyer: ${e(d.buyer)}, ${e(d.site)}<br>
Invoice ${invNo(d)}: ${R(d.qty * d.rate)} · Received ${inr(d.recd)} of ${inr(d.qty)}${cn(d) ? ` · Credit note ${R(cn(d))} (posted by ${CLERK}: ${d.cnPosted ? 'yes' : 'pending'})` : ''}<br>
${d.amt ? `Advance from ${LENDER}: ${R(d.amt)}, charges ${R(d.charges)}` : 'No advance'}</p>
<table>${rows}</table><p class="m">Time-stamped and cannot be edited. Corrections are added as new entries.</p>
<script>addEventListener('load',()=>setTimeout(()=>print(),300))</script></body></html>`;
}
