import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import QRCode from 'qrcode';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { CLERK, LENDER, MERCHANT, R, cn, inr, invNo, type Key } from '@cc/shared';
import { HttpError, Service, type BusEvent } from './service.js';

const COOKIE = 'cc_ws';
const KeyP = z.enum(['a', 'b', 'c']);
const IMAGE = /^image\/(jpeg|png|webp|gif)$/;

export function createApp(svc: Service, opts: { uploadDir: string; webDist?: string }) {
  mkdirSync(opts.uploadDir, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({ destination: opts.uploadDir }),
    limits: { fileSize: 12 * 1024 * 1024 },
    fileFilter: (_req, f, cb) => cb(null, IMAGE.test(f.mimetype)),
  });
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(express.json());

  const wsOf = (req: Request, res: Response): string => {
    const m = /(?:^|;\s*)cc_ws=([\w-]+)/.exec(req.headers.cookie ?? '');
    if (m && svc.exists(m[1])) return m[1];
    const id = svc.create();
    setCookie(res, id);
    return id;
  };
  const setCookie = (res: Response, id: string) => res.cookie(COOKIE, id, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 864e5, path: '/' });
  const key = (req: Request) => KeyP.parse(req.params.k) as Key;
  const origin = (req: Request) => process.env.PUBLIC_URL ?? `${req.protocol}://${req.get('host')}`;
  const wrap = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).then(out => { if (!res.headersSent) res.json(out ?? { ok: true }) }).catch(next);
  };

  /* ---------- owner app ---------- */
  app.get('/api/state', wrap((req, res) => svc.snapshot(wsOf(req, res))));
  app.post('/api/demo/reset', wrap((req, res) => {
    const { path, unlocked } = z.object({ path: KeyP.default('a'), unlocked: z.boolean().default(false) }).parse(req.body ?? {});
    const id = svc.create(path, unlocked); setCookie(res, id);
    return svc.snapshot(id);
  }));
  app.post('/api/demo/unlock', wrap((req, res) => svc.unlock(wsOf(req, res))));

  app.get('/api/events', (req, res) => {
    const ws = wsOf(req, res);
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write(`event: hello\ndata: ${JSON.stringify({ workspace: ws })}\n\n`);
    const on = (e: BusEvent) => res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    svc.bus.on(ws, on);
    req.on('close', () => { clearInterval(ping); svc.bus.off(ws, on) });
  });

  app.post('/api/dispatches/:k/request-photo', wrap((req, res) => {
    const { token } = svc.requestPhoto(wsOf(req, res), key(req), origin(req));
    return { token, url: `${origin(req)}/c/${token}` };
  }));
  app.post('/api/dispatches/:k/remind', wrap((req, res) => svc.remind(wsOf(req, res), key(req))));
  app.get('/api/dispatches/:k/link', wrap((req, res) => {
    const l = svc.store.latestLink(wsOf(req, res), key(req));
    return l ? { token: l.token, url: `${origin(req)}/c/${l.token}`, used: !!l.used_at } : null;
  }));
  app.post('/api/dispatches/:k/photo', upload.single('photo'), wrap(async (req, res) => {
    const ws = wsOf(req, res), k = key(req);
    if (req.file) await svc.selfPhoto(ws, k, { simulated: false, file: req.file.filename, mime: req.file.mimetype });
    else await svc.selfPhoto(ws, k, { simulated: true });
  }));
  app.get('/api/dispatches/:k/readings', wrap((req, res) => svc.readings(wsOf(req, res), key(req))));
  app.patch('/api/dispatches/:k/received', wrap((req, res) => {
    const { qty } = z.object({ qty: z.number() }).parse(req.body);
    svc.setReceived(wsOf(req, res), key(req), qty);
  }));
  app.post('/api/dispatches/:k/proof', wrap((req, res) => svc.sendProof(wsOf(req, res), key(req))));
  app.get('/api/dispatches/:k/email', wrap((req, res) => svc.emailView(wsOf(req, res), key(req))));
  app.get('/api/dispatches/:k/offer', wrap((req, res) => svc.offer(wsOf(req, res), key(req), Number(req.query.amount) || undefined)));
  app.post('/api/dispatches/:k/advance', wrap((req, res) => {
    const { amount } = z.object({ amount: z.number().int().positive() }).parse(req.body);
    svc.takeAdvance(wsOf(req, res), key(req), amount);
  }));
  app.post('/api/dispatches/:k/skip-advance', wrap((req, res) => svc.skipAdvance(wsOf(req, res), key(req))));
  app.get('/api/dispatches/:k/record', (req, res, next) => {
    try { res.type('html').send(recordPage(svc, wsOf(req, res), key(req))) } catch (e) { next(e) }
  });
  app.get('/api/loans', wrap((req, res) => svc.loans(wsOf(req, res))));

  /* ---------- stand-ins for the buyer's accounts team ---------- */
  app.post('/api/sim/:k/booked', wrap((req, res) => svc.bookAck(wsOf(req, res), key(req))));
  app.post('/api/sim/:k/confirm', wrap((req, res) => svc.buyerConfirms(wsOf(req, res), key(req))));
  app.post('/api/sim/:k/pay', wrap((req, res) => svc.buyerPays(wsOf(req, res), key(req))));

  /* ---------- driver's one-time link (no login, no cookie) ---------- */
  app.get('/api/capture/:token', wrap(req => svc.captureInfo(String(req.params.token))));
  app.post('/api/capture/:token/photo', upload.single('photo'), wrap(async req => {
    const t = String(req.params.token);
    if (req.file) await svc.capture(t, { simulated: false, file: req.file.filename, mime: req.file.mimetype });
    else await svc.capture(t, { simulated: true });
  }));
  app.get('/api/capture/:token/qr.svg', async (req, res, next) => {
    try {
      svc.captureInfo(String(req.params.token));
      res.type('image/svg+xml').send(await QRCode.toString(`${origin(req)}/c/${req.params.token}`, { type: 'svg', margin: 1 }));
    } catch (e) { next(e) }
  });

  app.get('/api/photos/:id', (req, res) => {
    const p = svc.store.photo(String(req.params.id));
    if (!p || !p.file || p.ws !== wsOf(req, res)) { res.status(404).end(); return }
    res.type(p.mime ?? 'image/jpeg').sendFile(join(opts.uploadDir, p.file));
  });

  /* ---------- web app ---------- */
  if (opts.webDist && existsSync(opts.webDist)) {
    app.use(express.static(opts.webDist, { index: false }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(opts.webDist!, 'index.html')));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) { res.status(err.status).json({ error: err.message }); return }
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Invalid request', issues: err.issues }); return }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });
  return app;
}

export const loadPhoto = (dir: string) => (file: string) => readFileSync(join(dir, file));

function recordPage(svc: Service, ws: string, k: Key) {
  const d = svc.snapshot(ws).dispatches[k];
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
